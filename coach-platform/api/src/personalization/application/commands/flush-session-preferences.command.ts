import { FlushSessionPreferencesDto } from '../dto/flush-session-preferences.dto';

/** Session-teardown flush: persist deferred preferences in one batch. */
export class FlushSessionPreferencesCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: FlushSessionPreferencesDto,
  ) {}
}
