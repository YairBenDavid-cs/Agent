/** Fetch the caller's active training profile (or onboarding status). */
export class GetTrainingProfileQuery {
  constructor(public readonly userId: string) {}
}
