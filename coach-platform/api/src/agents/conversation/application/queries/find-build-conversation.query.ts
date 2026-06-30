/**
 * Look up the user's in-flight `program_build` conversation, if any. Backs the
 * onboarding handoff: the FE polls/reads this to find the chat the server opened
 * so it can navigate the user straight into the build. Returns null (not a 404)
 * when no build is underway, so the caller can branch without catching.
 */
export class FindBuildConversationQuery {
  constructor(public readonly userId: string) {}
}
