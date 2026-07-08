import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  EventDiscipline,
  PreferenceDurability,
  PreferenceScope,
} from '../../domain/preference-event.model';
import {
  PreferenceTagDto,
  PreferenceTargetDto,
} from './append-preference-event.dto';
import { InjuryDetailsDto } from './injury-details.dto';

const DISCIPLINES: EventDiscipline[] = ['running', 'strength'];
const SCOPES: PreferenceScope[] = ['global', 'session', 'exercise'];
const DURABILITIES: PreferenceDurability[] = ['standing', 'one_off'];

/**
 * One already-tagged preference signal, source-agnostic. The producer (weekly
 * revision, assistant tool, session flush) wraps a list of these; the ingestion
 * service stamps the `source` and (for batches) a shared `batchId`.
 *
 * If `injury` is present, the item ALSO yields a health constraint.
 */
export class PreferenceItemDto {
  @IsString() eventDate!: string; // YYYY-MM-DD

  @IsOptional() @IsIn(DISCIPLINES) discipline?: EventDiscipline | null;

  @IsIn(SCOPES) scope!: PreferenceScope;

  @IsIn(DURABILITIES) durability!: PreferenceDurability;

  @IsOptional() @IsString() expiresAt?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PreferenceTargetDto)
  target?: PreferenceTargetDto | null;

  @IsObject()
  @ValidateNested()
  @Type(() => PreferenceTagDto)
  tag!: PreferenceTagDto;

  @IsOptional() @IsString() rawText?: string;

  @IsOptional() @IsString() rationale?: string | null;

  @IsOptional() @IsBoolean() appliedToProjection?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => InjuryDetailsDto)
  injury?: InjuryDetailsDto;
}
