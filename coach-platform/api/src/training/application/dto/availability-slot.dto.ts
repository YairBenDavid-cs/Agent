import { IsIn, Matches } from 'class-validator';
import { WeekDay } from '../../domain/training-profile.model';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A recurring weekly window. Times are 24h "HH:mm", local to the user tz. */
export class AvailabilitySlotDto {
  @IsIn(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  day!: WeekDay;

  @Matches(HHMM, { message: 'startTime must be "HH:mm" (24h).' })
  startTime!: string;

  @Matches(HHMM, { message: 'endTime must be "HH:mm" (24h).' })
  endTime!: string;
}
