import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/ApiError';
import { MOCK_API } from '@/shared/config';
import type { ConnectionsDraft } from '../../state/onboardingDraft';
import {
  completeGoogleConnect,
  connectGarmin,
  fetchIntegrationStatuses,
  runGarminSync,
  startGoogleConnect,
  verifyGarminMfa,
  type GarminSyncStatus,
} from '../../api/connections';
import { Field } from '../Field/Field';
import section from '../stepSection.module.css';
import styles from './ConnectStep.module.css';

interface ConnectStepProps {
  value: ConnectionsDraft;
  onChange: (patch: Partial<ConnectionsDraft>) => void;
  disabled: boolean;
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Final wizard step: link Garmin (email/password) and Google Calendar (OAuth).
 * Both are required, so the parent gates "Finish" on `value.garminConnected &&
 * value.googleConnected`. Google's consent flow navigates the whole tab away and
 * returns to /onboarding with a `?code=`; the wizard's draft is persisted across
 * that round-trip, and the effect below exchanges the code on the way back.
 *
 * Garmin is only considered "connected" once the initial data ingestion has
 * actually landed in the DB. After auth succeeds the server kicks off a backfill;
 * we poll its status and flip `garminConnected` to true only on `synced` — so the
 * program generated right after Finish always has the user's wearable data. A
 * failed fetch (`sync_failed`) is retried with the stored token (no re-login); an
 * auth rejection (`auth_failed`) drops back to the credential form.
 */
const SYNC_POLL_MS = 2000;
const MAX_SYNC_POLLS = 30; // ~60s before we offer a manual retry
export function ConnectStep({
  value,
  onChange,
  disabled,
}: ConnectStepProps): ReactElement {
  const [params, setParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [garminBusy, setGarminBusy] = useState(false);
  const [garminError, setGarminError] = useState<string | null>(null);
  // When Garmin issues a 2FA challenge we hold the pending loginId and switch the
  // card to a code-entry view. email/password stay in state so we can resend them
  // with the verify call (the server persists them only once login fully succeeds).
  const [mfaLoginId, setMfaLoginId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  // Tracks the post-auth ingestion run. `null` means we haven't started one yet
  // (still on the credential/MFA form). 'syncing' drives the poll effect below.
  const [garminSync, setGarminSync] = useState<GarminSyncStatus | null>(null);

  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const exchanged = useRef(false);

  // Initial sync: reflect any already-stored connections (e.g. the user linked
  // Garmin, left, and came back) so the step doesn't ask twice.
  useEffect(() => {
    let active = true;
    fetchIntegrationStatuses()
      .then((statuses) => {
        if (!active) return;
        // Upgrade-only: never flip a flag back to false. This avoids racing the
        // OAuth code exchange on the redirect return, where the server may not
        // have stored the Google token yet when this status read resolves.
        const patch: Partial<ConnectionsDraft> = {};
        // Garmin counts as connected only once its data has actually synced —
        // storing credentials isn't enough to plan against.
        const garmin = statuses.find((s) => s.provider === 'garmin');
        if (garmin?.syncStatus === 'synced') patch.garminConnected = true;
        if (statuses.some((s) => s.provider === 'google_calendar' && s.connected)) {
          patch.googleConnected = true;
        }
        if (Object.keys(patch).length > 0) onChange(patch);
      })
      .catch(() => {
        /* Status read is best-effort; the user can still connect. */
      });
    return () => {
      active = false;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture the Google OAuth code on redirect, exchange it, then strip the query.
  useEffect(() => {
    const code = params.get('code');
    if (!code || exchanged.current) return;
    exchanged.current = true;
    setGoogleBusy(true);
    completeGoogleConnect(code)
      .then(() => onChange({ googleConnected: true }))
      .catch((err: unknown) =>
        setGoogleError(messageOf(err, 'Could not finish connecting Google Calendar.')),
      )
      .finally(() => {
        setGoogleBusy(false);
        const next = new URLSearchParams(params);
        next.delete('code');
        next.delete('scope');
        next.delete('authuser');
        next.delete('prompt');
        setParams(next, { replace: true });
      });
  }, [params, onChange, setParams]);

  const markGarminConnected = (): void => {
    onChange({ garminConnected: true });
    setPassword('');
    setMfaLoginId(null);
    setMfaCode('');
  };

  // Auth succeeded — enter the syncing state and let the poll effect watch the
  // backfill land. We deliberately do NOT mark connected yet.
  const startGarminSync = (): void => {
    setGarminError(null);
    setMfaLoginId(null);
    setMfaCode('');
    setGarminSync('syncing');
  };

  // Re-run the fetch with the stored token (no re-login), then re-enter the poll.
  const handleRetrySync = (): void => {
    setGarminError(null);
    setGarminSync('syncing');
    runGarminSync().catch(() => {
      /* The authoritative outcome is read back by the poll effect. */
    });
  };

  // While syncing, poll the server until the run reaches a terminal state.
  useEffect(() => {
    if (garminSync !== 'syncing') return;

    if (MOCK_API) {
      const t = setTimeout(() => {
        setGarminSync('synced');
        markGarminConnected();
      }, 400);
      return () => clearTimeout(t);
    }

    let polls = 0;
    const id = setInterval(() => {
      polls += 1;
      fetchIntegrationStatuses()
        .then((statuses) => {
          const status =
            statuses.find((s) => s.provider === 'garmin')?.syncStatus ?? null;
          if (status === 'synced') {
            setGarminSync('synced');
            markGarminConnected();
          } else if (status === 'auth_failed') {
            // Credentials/session rejected — send them back to re-authenticate.
            setGarminSync(null);
            setGarminError(
              'Garmin rejected the connection. Please re-enter your email and password.',
            );
          } else if (status === 'sync_failed' || polls >= MAX_SYNC_POLLS) {
            setGarminSync('sync_failed');
            setGarminError(
              'We connected to Garmin but couldn’t pull your data. Please retry.',
            );
          }
          // 'syncing' / null → keep polling.
        })
        .catch(() => {
          if (polls >= MAX_SYNC_POLLS) {
            setGarminSync('sync_failed');
            setGarminError(
              'We couldn’t confirm your Garmin sync. Please retry.',
            );
          }
        });
    }, SYNC_POLL_MS);

    return () => clearInterval(id);
    // markGarminConnected is stable for our purposes; re-running on it is unwanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garminSync]);

  const handleConnectGarmin = (): void => {
    if (!email.trim() || !password.trim()) return;
    setGarminBusy(true);
    setGarminError(null);
    connectGarmin({ email: email.trim(), password })
      .then((result) => {
        if (result.status === 'mfa_required') {
          setMfaLoginId(result.loginId);
          return;
        }
        startGarminSync();
      })
      .catch((err: unknown) =>
        setGarminError(messageOf(err, 'Could not connect Garmin. Check your credentials.')),
      )
      .finally(() => setGarminBusy(false));
  };

  const handleVerifyMfa = (): void => {
    if (!mfaLoginId || !mfaCode.trim()) return;
    setGarminBusy(true);
    setGarminError(null);
    verifyGarminMfa({
      loginId: mfaLoginId,
      code: mfaCode.trim(),
      email: email.trim(),
      password,
    })
      .then((result) => {
        if (result.status === 'mfa_required') {
          // Shouldn't normally happen; ask for the code again.
          setMfaLoginId(result.loginId);
          return;
        }
        startGarminSync();
      })
      .catch((err: unknown) =>
        setGarminError(messageOf(err, 'Could not verify the code. Please try again.')),
      )
      .finally(() => setGarminBusy(false));
  };

  const handleConnectGoogle = (): void => {
    setGoogleBusy(true);
    setGoogleError(null);
    startGoogleConnect().catch((err: unknown) => {
      setGoogleError(messageOf(err, 'Could not start the Google Calendar connection.'));
      setGoogleBusy(false);
    });
  };

  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <p className={styles.cardTitle}>Garmin Connect</p>
          <p className={styles.cardHint}>
            We use your daily readiness, sleep and training load to adapt your plan.
          </p>
        </div>

        {value.garminConnected ? (
          <span className={styles.connected}>
            <span className={styles.dot} /> Connected
          </span>
        ) : garminSync === 'syncing' ? (
          <p className={styles.cardHint}>Syncing your Garmin data…</p>
        ) : garminSync === 'sync_failed' ? (
          <div className={styles.form}>
            {garminError !== null && <p className={styles.error}>{garminError}</p>}
            <button
              type="button"
              className={styles.button}
              onClick={handleRetrySync}
              disabled={disabled}
            >
              Retry sync
            </button>
          </div>
        ) : mfaLoginId !== null ? (
          <div className={styles.form}>
            <p className={styles.cardHint}>
              Garmin sent a verification code to your email. Enter it below to
              finish connecting.
            </p>
            <Field
              label="Verification code"
              value={mfaCode}
              onChange={setMfaCode}
              placeholder="123456"
              disabled={disabled || garminBusy}
            />
            {garminError !== null && <p className={styles.error}>{garminError}</p>}
            <button
              type="button"
              className={styles.button}
              onClick={handleVerifyMfa}
              disabled={disabled || garminBusy || !mfaCode.trim()}
            >
              {garminBusy ? 'Verifying…' : 'Verify code'}
            </button>
          </div>
        ) : (
          <div className={styles.form}>
            <Field
              label="Garmin email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              disabled={disabled || garminBusy}
            />
            <Field
              label="Garmin password"
              type="password"
              value={password}
              onChange={setPassword}
              disabled={disabled || garminBusy}
            />
            {garminError !== null && <p className={styles.error}>{garminError}</p>}
            <button
              type="button"
              className={styles.button}
              onClick={handleConnectGarmin}
              disabled={disabled || garminBusy || !email.trim() || !password.trim()}
            >
              {garminBusy ? 'Connecting…' : 'Connect Garmin'}
            </button>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <p className={styles.cardTitle}>Google Calendar</p>
          <p className={styles.cardHint}>
            Lets your coach place sessions around your real schedule.
          </p>
        </div>

        {value.googleConnected ? (
          <span className={styles.connected}>
            <span className={styles.dot} /> Connected
          </span>
        ) : (
          <div className={styles.form}>
            {googleError !== null && <p className={styles.error}>{googleError}</p>}
            <button
              type="button"
              className={styles.button}
              onClick={handleConnectGoogle}
              disabled={disabled || googleBusy}
            >
              {googleBusy ? 'Connecting…' : 'Connect Google Calendar'}
            </button>
          </div>
        )}
      </div>

      <p className={section.sectionTitle}>
        Both connections are required to finish setting up your coach.
      </p>
    </div>
  );
}
