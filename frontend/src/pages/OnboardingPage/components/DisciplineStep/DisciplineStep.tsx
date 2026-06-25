import type { ReactElement } from 'react';
import type { Discipline } from '../../domain/types';
import { OptionGroup, type ChipOption } from '../OptionChips/OptionGroup';

const DISCIPLINES: ChipOption<Discipline>[] = [
  { value: 'running', label: 'Running', hint: 'Build mileage, speed and endurance.' },
  { value: 'strength', label: 'Strength', hint: 'Build muscle and get stronger.' },
];

interface DisciplineStepProps {
  value: Discipline | null;
  onChange: (value: Discipline) => void;
  disabled: boolean;
}

export function DisciplineStep({ value, onChange, disabled }: DisciplineStepProps): ReactElement {
  return <OptionGroup options={DISCIPLINES} value={value} onChange={onChange} disabled={disabled} />;
}
