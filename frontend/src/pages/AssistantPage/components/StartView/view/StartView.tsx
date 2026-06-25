import { useState } from 'react';
import type { ReactElement } from 'react';
import { AssistantComposer } from '../../AssistantComposer/view/AssistantComposer';
import styles from './StartView.module.css';

interface StartViewProps {
  onStart: (text: string) => Promise<void>;
}

export function StartView({ onStart }: StartViewProps): ReactElement {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSend(text: string): void {
    setCreating(true);
    setError(null);
    onStart(text).catch(() => {
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
        <AssistantComposer onSend={handleSend} disabled={creating} autoFocus />
      </div>
    </div>
  );
}
