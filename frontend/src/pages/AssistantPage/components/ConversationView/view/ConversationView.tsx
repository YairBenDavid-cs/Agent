import { useCallback, useEffect, useState } from 'react';
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
import styles from './ConversationView.module.css';

interface ConversationViewProps {
  conversationId: string;
  pendingPromptRef: MutableRefObject<PendingPrompt | null>;
  onReplyComplete: () => void;
}

// The canned replies the Approve / Cancel consent buttons send; the next turn
// resolves the awaiting-confirmation question (no dedicated endpoint).
const CONFIRM_YES = 'Yes, apply that.';
const CONFIRM_NO = 'No, leave it as is.';

export function ConversationView({
  conversationId,
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
  const approval = useChatApproval(conversation?.pendingCardBatchId ?? null, {
    onResolved: refresh,
  });

  // The turn-level signals that drive the consent affordances. Reset whenever a
  // new turn starts so a stale block/confirmation never lingers.
  const [intentBlocked, setIntentBlocked] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const onTurnComplete = useCallback(
    (result: AssistantTurnResult): void => {
      setIntentBlocked(result.intentBlocked);
      setAwaitingConfirmation(result.awaitingConfirmation);
      // A fired pipeline may have produced (or superseded) a card batch — and
      // clears `attention` server-side. Re-derive the conversation either way.
      if (result.pipelineRun !== null || result.intentBlocked) {
        refresh();
      }
    },
    [refresh],
  );

  const {
    status,
    loadError,
    turns,
    phase,
    progressDetail,
    sendError,
    isBusy,
    send,
    stop,
    retry,
  } = useAssistantThread(conversationId, { initialPrompt, onReplyComplete, onTurnComplete });

  const onSend = useCallback(
    (text: string): void => {
      setIntentBlocked(false);
      setAwaitingConfirmation(false);
      send(text);
    },
    [send],
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
      setAwaitingConfirmation(false);
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

  return (
    <div className={styles.conversation}>
      <TurnList turns={turns} phase={phase} progressDetail={progressDetail} />

      {approval.batch !== null && (
        <ChatApproval
          batch={approval.batch}
          mode={mode}
          actionPending={approval.actionPending}
          actionError={approval.actionError}
          onApprove={approval.approve}
          onReject={approval.reject}
          onSwitchToPlan={() => onChangeMode('plan')}
          onRefresh={approval.refresh}
        />
      )}

      {awaitingConfirmation && !isBusy && (
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

      {intentBlocked && !isBusy && (
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

      <footer className={styles.footer}>
        <div className={styles.composerBar}>
          <ModeToggle mode={mode} disabled={modePending || isBusy} onChange={onChangeMode} />
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
        <AssistantComposer onSend={onSend} disabled={isBusy} autoFocus />
      </footer>
    </div>
  );
}
