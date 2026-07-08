import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MutableRefObject, ReactElement } from 'react';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { CheckIcon } from '@/shared/ui/icons/CheckIcon';
import { useAssistantThread } from '@/pages/AssistantPage/domain/assistant/hooks/useAssistantThread';
import { useChatApproval } from '@/pages/AssistantPage/domain/assistant/hooks/useChatApproval';
import { useConversation } from '@/pages/AssistantPage/domain/assistant/hooks/useConversation';
import { useConversationClose } from '@/pages/AssistantPage/domain/assistant/hooks/useConversationClose';
import type {
  AssistantTurnResult,
  ConversationMode,
  PendingPrompt,
} from '@/pages/AssistantPage/domain/assistant/types/assistant';
import { TurnList } from '../../TurnList/view/TurnList';
import { AssistantComposer } from '../../AssistantComposer/view/AssistantComposer';
import { ChatApproval } from '../../ChatApproval/view/ChatApproval';
import { ModeToggle } from '../../ModeToggle/ModeToggle';
import { SlotProposal } from '../../SlotProposal/SlotProposal';
import styles from './ConversationView.module.css';

interface ConversationViewProps {
  conversationId: string;
  // Bumped by the page when a `conversation` SSE beat targets THIS chat — the
  // backend posted a message outside a turn we're awaiting (build kickoff,
  // post-approval draft), so the transcript must be reloaded to show it.
  remoteUpdateTick: number;
  pendingPromptRef: MutableRefObject<PendingPrompt | null>;
  onReplyComplete: () => void;
}

// The canned replies the Approve / Cancel consent buttons send; the next turn
// resolves the awaiting-confirmation question (no dedicated endpoint).
const CONFIRM_YES = 'Yes, apply that.';
const CONFIRM_NO = 'No, leave it as is.';

export function ConversationView({
  conversationId,
  remoteUpdateTick,
  pendingPromptRef,
  onReplyComplete,
}: ConversationViewProps): ReactElement {
  const [initialPrompt] = useState<string | undefined>(() => {
    const pending = pendingPromptRef.current;
    return pending !== null && pending.id === conversationId ? pending.text : undefined;
  });

  useEffect(() => {
    const pending = pendingPromptRef.current;
    if (pending !== null && pending.id === conversationId) {
      pendingPromptRef.current = null;
    }
  }, [conversationId, pendingPromptRef]);

  const navigate = useNavigate();
  const { conversation, refresh, setMode, modePending } = useConversation(conversationId);
  const { closing, close } = useConversationClose(conversationId);

  const isBuild = conversation?.purpose === 'program_build';

  // Ask-mode intent block is a per-turn signal (not persisted on the message), so
  // it's React state reset on each new turn. Confirmation / slot / retry
  // affordances are derived from the transcript below so they survive reload.
  const [intentBlocked, setIntentBlocked] = useState(false);

  const onTurnComplete = useCallback(
    (result: AssistantTurnResult): void => {
      setIntentBlocked(result.intentBlocked);
      // A fired pipeline may have produced (or superseded) a card batch — and
      // clears `attention` server-side. Re-derive the conversation either way. A
      // build turn always re-derives (it may have opened/closed a session card).
      if (result.pipelineRun !== null || result.intentBlocked || isBuild) {
        refresh();
      }
    },
    [refresh, isBuild],
  );

  const {
    status,
    loadError,
    turns,
    phase,
    progress,
    sendError,
    isBusy,
    send,
    stop,
    retry,
    confirmSlot,
    resume,
    reloadTurns,
  } = useAssistantThread(conversationId, {
    initialPrompt,
    onReplyComplete,
    onTurnComplete,
    isBuild,
  });

  // A resolved card posts follow-up messages out-of-band (approval ack /
  // decline-ask), so re-derive the conversation AND reload the transcript.
  const onCardResolved = useCallback((): void => {
    refresh();
    reloadTurns();
  }, [refresh, reloadTurns]);

  // A `conversation` SSE beat targeted this chat: the backend appended a
  // message outside any turn we're awaiting — e.g. the build kickoff's welcome
  // and targets proposal, which land seconds after onboarding navigates here
  // (the transcript was fetched while still empty). Reload to show them. Skip
  // while a turn is in flight — its completion already reloads, and reloading
  // mid-send would race the optimistic user turn.
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;
  useEffect(() => {
    if (remoteUpdateTick === 0 || isBusyRef.current) {
      return;
    }
    reloadTurns();
    refresh();
  }, [remoteUpdateTick, reloadTurns, refresh]);

  const approval = useChatApproval(conversation?.pendingCardBatchId ?? null, {
    onResolved: onCardResolved,
  });

  // An empty build chat = the kickoff's welcome/proposal haven't been posted
  // yet (onboarding navigates here before they're written). The SSE beat is the
  // primary reload signal; this slow poll is the safety net for a beat that
  // fired before our stream (re)connected.
  const awaitingKickoff = isBuild && status === 'ready' && turns.length === 0;
  useEffect(() => {
    if (!awaitingKickoff) {
      return undefined;
    }
    const timer = setInterval(reloadTurns, 3000);
    return () => clearInterval(timer);
  }, [awaitingKickoff, reloadTurns]);

  // Derive the live build affordances from the latest assistant turn's meta, so
  // they survive a transcript reload / reopen (the meta lives on the message).
  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
  const slotProposal = lastAssistant?.meta?.slotProposal ?? null;
  const buildRetry = lastAssistant?.meta?.buildRetry === true;
  const awaitingConfirmation = lastAssistant?.meta?.awaitingConfirmation === true;

  // A resolved (approved/declined) or talked-past card shouldn't linger in the
  // transcript — once the user has moved on, one way or another, hide it. It's
  // keyed by batchId so a genuinely new suggestion (different id) still shows.
  const [hiddenBatchId, setHiddenBatchId] = useState<string | null>(null);
  const showApprovalCard = approval.batch !== null && approval.batch.batchId !== hiddenBatchId;

  const dismissApprovalCard = useCallback((): void => {
    if (approval.batch !== null) setHiddenBatchId(approval.batch.batchId);
  }, [approval.batch]);

  const onApproveCard = useCallback((): void => {
    dismissApprovalCard();
    approval.approve();
  }, [dismissApprovalCard, approval]);

  const onRejectCard = useCallback((): void => {
    dismissApprovalCard();
    approval.reject();
  }, [dismissApprovalCard, approval]);

  const onSend = useCallback(
    (text: string): void => {
      setIntentBlocked(false);
      // Sending a plain message instead of Approve/Decline is itself a way of
      // moving past the card — don't block the chat waiting for a decision,
      // just drop the card and answer whatever was asked.
      dismissApprovalCard();
      send(text);
    },
    [send, dismissApprovalCard],
  );

  const onChangeMode = useCallback(
    (mode: ConversationMode): void => {
      void setMode(mode);
    },
    [setMode],
  );

  // "Switch to Plan" on a refused Ask-mode mutation: flip the mode, then re-send
  // the same message so it actually runs — only after the server-side flip lands.
  const onSwitchToPlan = useCallback((): void => {
    setIntentBlocked(false);
    void setMode('plan').then(() => retry());
  }, [setMode, retry]);

  const onConfirm = useCallback(
    (apply: boolean): void => {
      onSend(apply ? CONFIRM_YES : CONFIRM_NO);
    },
    [onSend],
  );

  // End the session: flush the buffer server-side, then drop back to the start
  // screen. The chat itself is kept (close never deletes).
  const onEndSession = useCallback((): void => {
    void close().finally(() => navigate('/assistant'));
  }, [close, navigate]);

  if (status === 'loading') {
    return (
      <div className={styles.center}>
        <Spinner />
      </div>
    );
  }

  if (status === 'error') {
    return <div className={styles.center}>{loadError ?? 'Could not load this conversation.'}</div>;
  }

  const mode = conversation?.mode ?? 'plan';

  // A card approve/reject kicks off backend work (commit + the coach drafting
  // the next step) before the transcript reloads — surface the same "thinking"
  // indicator as a chat turn so the user sees Popvich working, not a dead chat.
  // Likewise an EMPTY build chat: onboarding lands here before the kickoff's
  // welcome/proposal are posted (they arrive via the SSE-triggered reload), so
  // show the coach thinking instead of a blank transcript.
  const displayPhase = approval.actionPending || awaitingKickoff ? 'thinking' : phase;
  const busy = isBusy || approval.actionPending;

  return (
    <div className={styles.conversation}>
      <div className={styles.scrollArea}>
        <TurnList turns={turns} phase={displayPhase} progress={progress} />

        {showApprovalCard && approval.batch !== null && (
          <ChatApproval
            batch={approval.batch}
            mode={mode}
            actionPending={approval.actionPending}
            actionError={approval.actionError}
            onApprove={onApproveCard}
            onReject={onRejectCard}
            onSwitchToPlan={() => onChangeMode('plan')}
            onRefresh={approval.refresh}
          />
        )}

        {slotProposal !== null && !busy && (
          <SlotProposal
            candidates={slotProposal.candidates}
            disabled={busy}
            onPick={confirmSlot}
          />
        )}

        {buildRetry && !busy && (
          <div className={styles.consent}>
            <span className={styles.consentText}>
              I couldn’t reach your coach. Want me to try again?
            </span>
            <button type="button" className={styles.consentApprove} onClick={resume}>
              <CheckIcon />
              Retry
            </button>
          </div>
        )}

        {/* Generic yes/no consent (e.g. lock weekly targets). Suppressed when a card,
            slot picker, or retry already owns the decision. */}
        {awaitingConfirmation &&
          !busy &&
          !showApprovalCard &&
          slotProposal === null &&
          !buildRetry && (
            <div className={styles.consent}>
              <span className={styles.consentText}>Apply this change?</span>
              <div className={styles.consentActions}>
                <button type="button" className={styles.consentApprove} onClick={() => onConfirm(true)}>
                  <CheckIcon />
                  Approve &amp; apply
                </button>
                <button type="button" className={styles.consentCancel} onClick={() => onConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

        {intentBlocked && !busy && (
          <div className={styles.consent}>
            <span className={styles.consentText}>
              This chat is in <strong>Ask</strong> mode, so I can’t change your program.
            </span>
            <button type="button" className={styles.consentApprove} onClick={onSwitchToPlan}>
              <CheckIcon />
              Switch to Plan &amp; apply
            </button>
          </div>
        )}

        {sendError !== null && (
          <div className={styles.error}>
            <span>{sendError}</span>
            <button type="button" className={styles.retry} onClick={retry}>
              Retry
            </button>
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <div className={styles.composerBar}>
          <ModeToggle mode={mode} disabled={modePending || busy} onChange={onChangeMode} />
          {isBusy ? (
            <button type="button" className={styles.stop} onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className={styles.endSession}
              onClick={onEndSession}
              disabled={closing}
            >
              {closing ? 'Ending…' : 'End session'}
            </button>
          )}
        </div>
        <AssistantComposer onSend={onSend} disabled={busy} autoFocus />
      </footer>
    </div>
  );
}
