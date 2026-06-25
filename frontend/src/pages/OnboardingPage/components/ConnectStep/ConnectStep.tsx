import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/ApiError';
import type { ConnectionsDraft } from '../../state/onboardingDraft';
import {
  completeGoogleConnect,
  connectGarmin,
  fetchIntegrationStatuses,
  startGoogleConnect,
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
 */
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
        const connected = (p: string): boolean =>
          statuses.some((s) => s.provider === p && s.connected);
        onChange({
          garminConnected: connected('garmin'),
          googleConnected: connected('google_calendar'),
        });
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

  const handleConnectGarmin = (): void => {
    if (!email.trim() || !password.trim()) return;
    setGarminBusy(true);
    setGarminError(null);
    connectGarmin({ email: email.trim(), password })
      .then(() => {
        onChange({ garminConnected: true });
        setPassword('');
      })
      .catch((err: unknown) =>
        setGarminError(messageOf(err, 'Could not connect Garmin. Check your credentials.')),
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
