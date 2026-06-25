import { useEffect, useState } from 'react';
import type { MutableRefObject, ReactElement } from 'react';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { useAssistantThread } from '@/pages/AssistantPage/domain/assistant/hooks/useAssistantThread';
import type { PendingPrompt } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import { TurnList } from '../../TurnList/view/TurnList';
import { AssistantComposer } from '../../AssistantComposer/view/AssistantComposer';
import styles from './ConversationView.module.css';

interface ConversationViewProps {
  conversationId: string;
  pendingPromptRef: MutableRefObject<PendingPrompt | null>;
  onReplyComplete: () => void;
  onTitle: (title: string) => void;
}

export function ConversationView({
  conversationId,
  pendingPromptRef,
  onReplyComplete,
  onTitle,
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

  const {
    status,
    loadError,
    turns,
    phase,
    streamingText,
    streamError,
    isBusy,
    send,
    stop,
    retry,
  } = useAssistantThread(conversationId, { initialPrompt, onReplyComplete, onTitle });

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

  return (
    <div className={styles.conversation}>
      <TurnList turns={turns} phase={phase} streamingText={streamingText} />

      {streamError !== null && (
        <div className={styles.error}>
          <span>{streamError}</span>
          <button type="button" className={styles.retry} onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <footer className={styles.footer}>
        {isBusy && (
          <button type="button" className={styles.stop} onClick={stop}>
            Stop
          </button>
        )}
        <AssistantComposer onSend={send} disabled={isBusy} autoFocus />
      </footer>
    </div>
  );
}
