import { IsISO8601, IsNumber, IsString, Matches } from 'class-validator';

/**
 * A slow-moving fitness marker observed by the fetcher. The handler decides
 * whether it is actually a change before appending to the log.
 */
export class ProfileCandidateDto {
  // Known scalar metrics, or a per-exercise 1RM like "1rm.SQUAT".
  @IsString()
  @Matches(
    /^(vo2max|lt_hr|lt_speed_raw|race_pred_5k_sec|race_pred_10k_sec|race_pred_half_sec|race_pred_marathon_sec|hill_score|endurance_score|1rm\.[A-Z_]+)$/,
  )
  metric!: string;

  @IsNumber()
  value!: number;

  @IsISO8601({ strict: true })
  effectiveDate!: string;
}
