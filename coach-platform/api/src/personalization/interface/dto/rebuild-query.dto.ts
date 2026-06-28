import { IsIn, IsOptional } from 'class-validator';
import { EventDiscipline } from '../../domain/preference-event.model';

const DISCIPLINES: EventDiscipline[] = ['running', 'strength'];

/** `?discipline=` optional — omit to rebuild both disciplines. */
export class RebuildQueryDto {
  @IsOptional() @IsIn(DISCIPLINES) discipline?: EventDiscipline;
}
