import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  /** When set, clicking the toast runs this before dismissing (e.g. navigate). */
  onClick?: (() => void) | undefined;
}

interface UseToasts {
  toasts: Toast[];
  showToast: (message: string, onClick?: () => void) => void;
  dismiss: (id: string) => void;
}

const TTL_MS = 4000;

/** Minimal transient-notification queue; auto-dismisses each toast after 4s. */
export function useToasts(): UseToasts {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, onClick?: () => void): void => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, onClick }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TTL_MS),
      );
    },
    [dismiss],
  );

  return { toasts, showToast, dismiss };
}
