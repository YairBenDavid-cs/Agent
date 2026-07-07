import type { ReactElement } from 'react';
import type { ProfileDraft } from '../../state/onboardingDraft';
import { NumberStepper } from '../NumberStepper/NumberStepper';
import controls from '../controls.module.css';
import styles from './BodyStep.module.css';

interface BodyStepProps {
  value: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  disabled: boolean;
}

export function BodyStep({ value, onChange, disabled }: BodyStepProps): ReactElement {
  return (
    <div className={controls.card}>
      <div className={styles.grid}>
        <div className={controls.fieldGroup}>
          <span className={controls.fieldLabel}>Height</span>
          <NumberStepper
            ariaLabel="height in centimetres"
            value={value.heightCm}
            onChange={(heightCm) => onChange({ heightCm })}
            min={120}
            max={230}
            unit="cm"
            disabled={disabled}
          />
        </div>
        <div className={controls.fieldGroup}>
          <span className={controls.fieldLabel}>Weight</span>
          <NumberStepper
            ariaLabel="weight in kilograms"
            value={value.weightKg}
            onChange={(weightKg) => onChange({ weightKg })}
            min={35}
            max={250}
            unit="kg"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
