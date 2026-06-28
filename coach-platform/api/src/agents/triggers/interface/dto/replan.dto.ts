import { IsIn } from 'class-validator';

/** Which subset pipeline to fire for a user-initiated manual re-plan. */
export type ReplanScope = 'safety' | 'content' | 'timing';

export class ReplanDto {
  @IsIn(['safety', 'content', 'timing'])
  scope!: ReplanScope;
}
