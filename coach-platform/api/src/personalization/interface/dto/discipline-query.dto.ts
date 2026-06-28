import { IsIn } from 'class-validator';
import { EventDiscipline } from '../../domain/preference-event.model';

const DISCIPLINES: EventDiscipline[] = ['running', 'strength'];

/** `?discipline=running|strength` — required selector for discipline-scoped reads. */
export class DisciplineQueryDto {
  @IsIn(DISCIPLINES) discipline!: EventDiscipline;
}
