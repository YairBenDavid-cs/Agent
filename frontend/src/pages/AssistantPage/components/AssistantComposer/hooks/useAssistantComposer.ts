import { useCallback, useState } from 'react';

interface UseAssistantComposer {
  text: string;
  setText: (value: string) => void;
  submit: () => void;
  canSend: boolean;
}

export function useAssistantComposer(
  onSend: (text: string) => void,
  disabled: boolean,
): UseAssistantComposer {
  const [text, setText] = useState('');
  const canSend = !disabled && text.trim() !== '';

  const submit = useCallback((): void => {
    if (disabled) {
      return;
    }
    const trimmed = text.trim();
    if (trimmed === '') {
      return;
    }
    onSend(trimmed);
    setText('');
  }, [text, onSend, disabled]);

  return { text, setText, submit, canSend };
}
