import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsString,
  Matches,
} from 'class-validator';
import { GarminSyncMode } from '../../domain/garmin-sync-schedule.model';

export class UpsertGarminSyncScheduleDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    each: true,
    message: 'Each sync time must be "HH:mm".',
  })
  syncTimesLocal!: string[];

  @IsIn(['plan', 'auto'])
  mode!: GarminSyncMode;

  @IsBoolean()
  enabled!: boolean;
}
