import { useState, type ReactElement } from 'react';
import type { Sex } from '../../domain/types';
import type { ProfileDraft } from '../../state/onboardingDraft';
import {
  MONTHS,
  ageFrom,
  birthYears,
  composeDob,
  daysInMonth,
  parseDob,
  type DobParts,
} from '../../domain/dob';
import { Dropdown } from '../Dropdown/Dropdown';
import controls from '../controls.module.css';
import styles from './BasicsStep.module.css';

const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

interface BasicsStepProps {
  value: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  disabled: boolean;
}

function MenuRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`${controls.menuRow} ${selected ? controls.menuRowSelected : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function BasicsStep({ value, onChange, disabled }: BasicsStepProps): ReactElement {
  const now = new Date();
  // Partial month/day/year selections are held locally: the composed ISO date
  // isn't stored until all three are chosen, so parent state alone would forget
  // an in-progress pick and each dropdown would revert to its placeholder.
  const [parts, setParts] = useState<DobParts>(() => parseDob(value.dateOfBirth));
  const years = birthYears(now.getFullYear());
  const dayCount = daysInMonth(parts.year, parts.month);
  const days = Array.from({ length: dayCount }, (_, i) => i + 1);
  const age = ageFrom(parts, now);

  const setPart = (patch: Partial<DobParts>): void => {
    const nextParts = { ...parts, ...patch };
    // Clamp the day if the new month/year has fewer days.
    if (nextParts.day !== null) {
      const max = daysInMonth(nextParts.year, nextParts.month);
      if (nextParts.day > max) {
        nextParts.day = max;
      }
    }
    setParts(nextParts);
    onChange({ dateOfBirth: composeDob(nextParts) });
  };

  return (
    <div className={controls.card}>
      <div className={controls.fieldGroup}>
        <span className={controls.fieldLabel}>Sex</span>
        <div className={`${controls.chipGrid} ${styles.sexGrid}`} role="radiogroup">
          {SEXES.map((option) => {
            const active = option.value === value.sex;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${controls.chip} ${active ? controls.chipSelected : ''}`}
                onClick={() => onChange({ sex: option.value })}
                disabled={disabled}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={controls.fieldGroup}>
        <span className={controls.fieldLabel}>Date of birth</span>
        <div className={styles.dobGrid}>
          <Dropdown
            ariaLabel="Birth month"
            disabled={disabled}
            placeholder={parts.month === null}
            label={parts.month === null ? 'Month' : MONTHS[parts.month - 1]}
          >
            {(close) =>
              MONTHS.map((name, i) => (
                <MenuRow
                  key={name}
                  label={name}
                  selected={parts.month === i + 1}
                  onClick={() => {
                    setPart({ month: i + 1 });
                    close();
                  }}
                />
              ))
            }
          </Dropdown>
          <Dropdown
            ariaLabel="Birth day"
            disabled={disabled}
            placeholder={parts.day === null}
            label={parts.day === null ? 'Day' : String(parts.day)}
          >
            {(close) =>
              days.map((d) => (
                <MenuRow
                  key={d}
                  label={String(d)}
                  selected={parts.day === d}
                  onClick={() => {
                    setPart({ day: d });
                    close();
                  }}
                />
              ))
            }
          </Dropdown>
          <Dropdown
            ariaLabel="Birth year"
            disabled={disabled}
            placeholder={parts.year === null}
            label={parts.year === null ? 'Year' : String(parts.year)}
          >
            {(close) =>
              years.map((y) => (
                <MenuRow
                  key={y}
                  label={String(y)}
                  selected={parts.year === y}
                  onClick={() => {
                    setPart({ year: y });
                    close();
                  }}
                />
              ))
            }
          </Dropdown>
        </div>
        {age !== null ? (
          <p className={`${styles.ageLine} ${styles.ageComplete}`}>You&rsquo;re {age} years old.</p>
        ) : (
          <p className={styles.ageLine}>
            We use this to tune training load — never shown to anyone.
          </p>
        )}
      </div>
    </div>
  );
}
