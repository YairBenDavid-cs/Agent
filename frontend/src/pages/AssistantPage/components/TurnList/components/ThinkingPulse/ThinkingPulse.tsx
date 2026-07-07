import type { ReactElement } from 'react';
import { BasketballIcon } from '@/shared/ui/icons/BasketballIcon';
import type { WorkflowProgress } from '@/pages/AssistantPage/domain/assistant/stream/assistantStream';
import { describeProgress } from '@/pages/AssistantPage/domain/assistant/stream/workflowLabels';
import styles from './ThinkingPulse.module.css';

interface ThinkingPulseProps {
  progress: WorkflowProgress | null;
}

export function ThinkingPulse({ progress }: ThinkingPulseProps): ReactElement {
  const { title, subtitle } = describeProgress(progress);
  const status = subtitle !== undefined ? `${title}, ${subtitle}` : title;

  return (
    <div className={styles.row} role="status" aria-label={status}>
      <BasketballIcon className={styles.icon} size={30} />
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        {subtitle !== undefined && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
    </div>
  );
}
