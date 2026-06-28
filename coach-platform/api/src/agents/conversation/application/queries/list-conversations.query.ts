export class ListConversationsQuery {
  constructor(
    public readonly userId: string,
    public readonly cursor: string | null = null,
    public readonly limit = 20,
  ) {}
}
