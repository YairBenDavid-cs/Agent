import type { FormEvent, ReactElement } from 'react';
import { SendIcon } from '@/shared/ui/icons/SendIcon';
import { useAssistantComposer } from '../hooks/useAssistantComposer';
import styles from './AssistantComposer.module.css';

interface AssistantComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export function AssistantComposer({
  onSend,
  disabled = false,
  placeholder = 'Message Popvich',
  autoFocus = false,
}: AssistantComposerProps): ReactElement {
  const { text, setText, submit, canSend } = useAssistantComposer(onSend, disabled);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submit();
  }

  return (
    <form className={styles.composer} onSubmit={onSubmit}>
      <input
        className={styles.input}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={disabled ? 'Waiting for Popvich…' : placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <button type="submit" className={styles.send} disabled={!canSend} aria-label="Send message">
        <SendIcon />
      </button>
    </form>
  );
}
