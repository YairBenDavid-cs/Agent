import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
}

interface UseToasts {
  toasts: Toast[];
  showToast: (message: string) => void;
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
    (message: string): void => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TTL_MS),
      );
    },
    [dismiss],
  );

  return { toasts, showToast, dismiss };
}
