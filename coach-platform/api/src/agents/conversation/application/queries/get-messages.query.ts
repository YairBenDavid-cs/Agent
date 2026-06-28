export class GetMessagesQuery {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly cursor: string | null = null,
    public readonly limit = 30,
    /** 'desc' (newest first, for initial render) or 'asc' (chronological). */
    public readonly order: 'asc' | 'desc' = 'desc',
  ) {}
}
