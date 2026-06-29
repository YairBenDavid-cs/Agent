import type { ReactElement } from 'react';
import type { Toast } from './useToasts';
import styles from './ToastViewport.module.css';

interface ToastViewportProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps): ReactElement | null {
  if (toasts.length === 0) {
    return null;
  }
  return (
    <div className={styles.viewport} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={styles.toast}
          onClick={() => {
            toast.onClick?.();
            onDismiss(toast.id);
          }}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
