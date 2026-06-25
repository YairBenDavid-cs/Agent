import type { ReactElement } from 'react';
import { COUNTRIES } from '../../domain/countries';
import type { Sex } from '../../domain/types';
import type { ProfileDraft } from '../../state/onboardingDraft';
import { Field } from '../Field/Field';
import { OptionGroup, type ChipOption } from '../OptionChips/OptionGroup';
import section from '../stepSection.module.css';
import styles from './ProfileStep.module.css';

const SEXES: ChipOption<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

interface ProfileStepProps {
  value: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  disabled: boolean;
}

export function ProfileStep({ value, onChange, disabled }: ProfileStepProps): ReactElement {
  return (
    <div className={section.stack}>
      <div className={section.section}>
        <p className={section.sectionTitle}>Sex</p>
        <OptionGroup
          options={SEXES}
          value={value.sex}
          onChange={(sex) => onChange({ sex })}
          disabled={disabled}
        />
      </div>
      <Field
        label="Date of birth"
        type="date"
        value={value.dateOfBirth}
        onChange={(dateOfBirth) => onChange({ dateOfBirth })}
        disabled={disabled}
      />
      <label className={styles.field}>
        <span className={styles.label}>Country</span>
        <select
          className={styles.select}
          value={value.country}
          onChange={(event) => onChange({ country: event.target.value })}
          disabled={disabled}
        >
          <option value="" disabled>
            Select your country…
          </option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.field}>
        <span className={styles.labelRow}>
          <span className={styles.label}>Time zone</span>
          <span className={styles.auto}>auto-detected</span>
        </span>
        <span className={styles.timezone}>{value.timezone || 'Detecting…'}</span>
      </div>
      <div className={section.row}>
        <Field
          label="Height (cm)"
          type="number"
          value={value.heightCm}
          onChange={(heightCm) => onChange({ heightCm })}
          optional
          min={1}
          disabled={disabled}
        />
        <Field
          label="Weight (kg)"
          type="number"
          value={value.weightKg}
          onChange={(weightKg) => onChange({ weightKg })}
          optional
          min={1}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
