import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ConversationMode } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import { AssistantComposer } from '../../AssistantComposer/view/AssistantComposer';
import { ModeToggle } from '../../ModeToggle/ModeToggle';
import styles from './StartView.module.css';

interface StartViewProps {
  onStart: (text: string, mode: ConversationMode) => Promise<void>;
  // Seed the composer when arriving via a deep-link (e.g. "Discuss in chat"
  // from a program card). The user can edit before sending.
  initialText?: string | undefined;
}

export function StartView({ onStart, initialText }: StartViewProps): ReactElement {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The mode the new conversation opens in. Default read-only `ask` (mutation is
  // a deliberate switch to Plan/Auto); passed to onStart so the first message is
  // processed under it.
  const [mode, setMode] = useState<ConversationMode>('ask');

  function handleSend(text: string): void {
    setCreating(true);
    setError(null);
    onStart(text, mode).catch(() => {
      setCreating(false);
      setError('Could not start a conversation. Please try again.');
    });
  }

  return (
    <div className={styles.start}>
      <div className={styles.inner}>
        <h1 className={styles.heading}>How can I help?</h1>
        <p className={styles.subheading}>Ask anything to start a new conversation with Popvich.</p>
        {error !== null && <p className={styles.error}>{error}</p>}
        <AssistantComposer
          onSend={handleSend}
          disabled={creating}
          autoFocus
          initialText={initialText}
        />
        <div className={styles.modeRow}>
          <ModeToggle mode={mode} disabled={creating} onChange={setMode} />
        </div>
      </div>
    </div>
  );
}
