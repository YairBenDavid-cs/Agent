import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrimaryGoal } from '../../domain/training-profile.model';

/**
 * The user's 3-month intent. `horizon` is NOT accepted from the client — the
 * server derives it (onboarding date + 3 months) so it can't be spoofed.
 */
export class GoalDto {
  @IsIn([
    'build_endurance',
    'lose_weight',
    'build_muscle',
    'get_stronger',
    'race_prep',
    'general_fitness',
    'improve_speed',
    'run_longer',
    'build_power',
    'body_recomp',
  ])
  primaryGoal!: PrimaryGoal;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
