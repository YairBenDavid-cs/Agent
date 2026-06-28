/** Assemble the Planner (scheduler) context slice (cross-discipline time windows). */
export class GetSchedulingContextQuery {
  constructor(public readonly userId: string) {}
}
