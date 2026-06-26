/** Fetch the caller's active program (with its week skeleton), or none. */
export class GetActiveProgramQuery {
  constructor(public readonly userId: string) {}
}
