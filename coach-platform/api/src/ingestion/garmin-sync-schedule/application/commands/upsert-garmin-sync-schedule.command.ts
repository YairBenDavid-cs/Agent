import { GarminSyncMode } from '../../domain/garmin-sync-schedule.model';

export class UpsertGarminSyncScheduleCommand {
  constructor(
    public readonly userId: string,
    public readonly syncTimesLocal: string[],
    public readonly mode: GarminSyncMode,
    public readonly enabled: boolean,
  ) {}
}
