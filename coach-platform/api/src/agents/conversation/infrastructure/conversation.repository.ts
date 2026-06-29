import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../../common/infrastructure/base-tenant.repository';
import {
  Conversation,
  ConversationMode,
  ConversationOrigin,
  Message,
  PendingCandidate,
} from '../domain/conversation.model';
import {
  ConversationRepositoryPort,
  NewMessage,
  Page,
} from '../domain/conversation.repository.port';
import { ConversationDoc } from './conversation.schema';
import { MessageDoc } from './message.schema';

/** Cursor helpers — opaque base64 of the keyset key. */
const encode = (raw: string): string => Buffer.from(raw, 'utf8').toString('base64url');
const decode = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

type ConversationLean = ConversationDoc & { _id: unknown; createdAt?: Date; updatedAt?: Date };
type MessageLean = MessageDoc & { _id: unknown; createdAt?: Date };

@Injectable()
export class ConversationRepository
  extends BaseTenantRepository<ConversationDoc>
  implements ConversationRepositoryPort
{
  constructor(
    @InjectModel(ConversationDoc.name) model: Model<ConversationDoc>,
    @InjectModel(MessageDoc.name) private readonly messages: Model<MessageDoc>,
  ) {
    super(model);
  }

  async createConversation(
    userId: string,
    title: string | null = null,
    opts: {
      mode?: ConversationMode;
      origin?: ConversationOrigin;
      attention?: boolean;
    } = {},
  ): Promise<Conversation> {
    const doc = await this.model.create({
      user_id: userId,
      title,
      status: 'active',
      mode: opts.mode ?? 'plan',
      origin: opts.origin ?? 'user',
      attention: opts.attention ?? false,
      summary: '',
      summarized_up_to_seq: 0,
      last_seq: 0,
      pending_card_batch_id: null,
      pending_candidates: [],
      closed_at: null,
    });
    return toConversation(doc.toObject() as ConversationLean);
  }

  async setMode(
    userId: string,
    conversationId: string,
    mode: ConversationMode,
  ): Promise<Conversation | null> {
    const doc = (await this.model
      .findOneAndUpdate(
        this.scoped(userId, { _id: conversationId }),
        { $set: { mode } },
        { new: true },
      )
      .lean()
      .exec()) as ConversationLean | null;
    return doc ? toConversation(doc) : null;
  }

  async findConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation | null> {
    const doc = (await this.findOneScoped(userId, {
      _id: conversationId,
    })) as ConversationLean | null;
    return doc ? toConversation(doc) : null;
  }

  async listConversations(
    userId: string,
    opts: { cursor?: string | null; limit: number },
  ): Promise<Page<Conversation>> {
    const filter: Record<string, unknown> = {};
    if (opts.cursor) {
      const [updatedAt, id] = decode(opts.cursor).split('|');
      filter.$or = [
        { updated_at: { $lt: new Date(updatedAt) } },
        { updated_at: new Date(updatedAt), _id: { $lt: id } },
      ];
    }
    const docs = (await this.model
      .find(this.scoped(userId, filter))
      .sort({ updated_at: -1, _id: -1 })
      .limit(opts.limit + 1)
      .lean()
      .exec()) as ConversationLean[];

    const page = paginate(docs, opts.limit, (d) =>
      encode(`${(d.updatedAt ?? new Date()).toISOString()}|${String(d._id)}`),
    );
    return { items: page.items.map(toConversation), nextCursor: page.nextCursor };
  }

  async appendMessage(
    userId: string,
    conversationId: string,
    msg: NewMessage,
  ): Promise<Message> {
    // Atomically reserve the next seq on the conversation, then insert the
    // message with it. The unique {conversation_id, seq} index is the final
    // guard against any duplicate seq under concurrency.
    const updated = (await this.model
      .findOneAndUpdate(
        this.scoped(userId, { _id: conversationId }),
        { $inc: { last_seq: 1 } },
        { new: true },
      )
      .lean()
      .exec()) as ConversationLean | null;
    if (!updated) {
      throw new Error(`Conversation ${conversationId} not found for user.`);
    }
    const seq = updated.last_seq;
    const doc = await this.messages.create({
      conversation_id: conversationId,
      user_id: userId,
      seq,
      role: msg.role,
      content: msg.content,
      meta: msg.meta ?? null,
    });
    return toMessage(doc.toObject() as MessageLean);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts: { cursor?: string | null; limit: number; order: 'asc' | 'desc' },
  ): Promise<Page<Message>> {
    const sortDir = opts.order === 'asc' ? 1 : -1;
    const filter: Record<string, unknown> = { conversation_id: conversationId };
    if (opts.cursor) {
      const seq = Number(decode(opts.cursor));
      filter.seq = opts.order === 'asc' ? { $gt: seq } : { $lt: seq };
    }
    const docs = (await this.messages
      .find(this.scoped(userId, filter))
      .sort({ seq: sortDir })
      .limit(opts.limit + 1)
      .lean()
      .exec()) as MessageLean[];

    const page = paginate(docs, opts.limit, (d) => encode(String(d.seq)));
    return { items: page.items.map(toMessage), nextCursor: page.nextCursor };
  }

  async listMessagesAfterSeq(
    userId: string,
    conversationId: string,
    afterSeq: number,
  ): Promise<Message[]> {
    const docs = (await this.messages
      .find(
        this.scoped(userId, {
          conversation_id: conversationId,
          seq: { $gt: afterSeq },
        }),
      )
      .sort({ seq: 1 })
      .lean()
      .exec()) as MessageLean[];
    return docs.map(toMessage);
  }

  async updateSummary(
    userId: string,
    conversationId: string,
    summary: string,
    summarizedUpToSeq: number,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: conversationId }), {
        $set: { summary, summarized_up_to_seq: summarizedUpToSeq },
      })
      .exec();
  }

  async setPendingCardBatch(
    userId: string,
    conversationId: string,
    cardBatchId: string | null,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: conversationId }), {
        $set: { pending_card_batch_id: cardBatchId },
      })
      .exec();
  }

  async closeConversation(userId: string, conversationId: string): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: conversationId }), {
        $set: { status: 'closed', closed_at: new Date().toISOString() },
      })
      .exec();
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    // Delete the conversation first: an interrupted cascade then leaves orphan
    // messages (invisible to the UI, harmless) rather than a visible empty
    // conversation. deletedCount drives the not-found signal.
    const { deletedCount } = await this.model
      .deleteOne(this.scoped(userId, { _id: conversationId }))
      .exec();
    if (!deletedCount) {
      return false;
    }
    await this.messages
      .deleteMany(this.scoped(userId, { conversation_id: conversationId }))
      .exec();
    return true;
  }

  async updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<Conversation | null> {
    const doc = (await this.model
      .findOneAndUpdate(
        this.scoped(userId, { _id: conversationId }),
        { $set: { title } },
        { new: true },
      )
      .lean()
      .exec()) as ConversationLean | null;
    return doc ? toConversation(doc) : null;
  }

  async addPendingCandidates(
    userId: string,
    conversationId: string,
    candidates: PendingCandidate[],
  ): Promise<Conversation | null> {
    if (candidates.length === 0) {
      return this.findConversation(userId, conversationId);
    }
    const doc = (await this.model
      .findOneAndUpdate(
        this.scoped(userId, { _id: conversationId }),
        { $push: { pending_candidates: { $each: candidates } } },
        { new: true },
      )
      .lean()
      .exec()) as ConversationLean | null;
    return doc ? toConversation(doc) : null;
  }

  async clearPendingCandidates(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: conversationId }), {
        $set: { pending_candidates: [] },
      })
      .exec();
  }

  async findIdleActive(
    idleBeforeIso: string,
    limit: number,
  ): Promise<Conversation[]> {
    const docs = (await this.model
      .find({ status: 'active', updated_at: { $lte: new Date(idleBeforeIso) } })
      .sort({ updated_at: 1 })
      .limit(limit)
      .lean()
      .exec()) as ConversationLean[];
    return docs.map(toConversation);
  }
}

/** Trim the over-fetched extra row and derive the next cursor. */
function paginate<T>(
  docs: T[],
  limit: number,
  cursorOf: (d: T) => string,
): { items: T[]; nextCursor: string | null } {
  const hasMore = docs.length > limit;
  const items = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? cursorOf(items[items.length - 1]) : null;
  return { items, nextCursor };
}

function toConversation(d: ConversationLean): Conversation {
  return {
    id: String(d._id),
    userId: d.user_id,
    title: d.title,
    status: d.status,
    // Legacy rows predate these fields; fall back to the back-compat defaults.
    mode: d.mode ?? 'plan',
    origin: d.origin ?? 'user',
    attention: d.attention ?? false,
    summary: d.summary,
    summarizedUpToSeq: d.summarized_up_to_seq,
    lastSeq: d.last_seq,
    pendingCardBatchId: d.pending_card_batch_id,
    // Legacy rows predate the buffer; an absent field reads as an empty buffer.
    pendingCandidates: (d.pending_candidates ?? []) as PendingCandidate[],
    createdAt: (d.createdAt ?? new Date()).toISOString(),
    updatedAt: (d.updatedAt ?? new Date()).toISOString(),
    closedAt: d.closed_at,
  };
}

function toMessage(d: MessageLean): Message {
  return {
    id: String(d._id),
    conversationId: d.conversation_id,
    userId: d.user_id,
    seq: d.seq,
    role: d.role,
    content: d.content,
    meta: d.meta,
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}
