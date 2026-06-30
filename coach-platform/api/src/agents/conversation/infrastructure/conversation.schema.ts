import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  BuildContext,
  ConversationMode,
  ConversationOrigin,
  ConversationPurpose,
  ConversationStatus,
} from '../domain/conversation.model';

export type ConversationDocument = HydratedDocument<ConversationDoc>;

const STATUSES = ['active', 'closed'];
const MODES = ['plan', 'ask'];
const ORIGINS = ['user', 'system'];
const PURPOSES = ['program_build'];

@Schema({ collection: 'conversations', timestamps: true })
export class ConversationDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, default: null }) title!: string | null;
  @Prop({ type: String, required: true, enum: STATUSES, default: 'active' })
  status!: ConversationStatus;

  // `plan` default preserves the pre-dual-mode behavior (turns may mutate) for
  // every existing row; the Ask gate only activates when mode is set to `ask`.
  @Prop({ type: String, required: true, enum: MODES, default: 'plan' })
  mode!: ConversationMode;
  @Prop({ type: String, required: true, enum: ORIGINS, default: 'user' })
  origin!: ConversationOrigin;
  @Prop({ type: Boolean, required: true, default: false }) attention!: boolean;

  /**
   * Tier-3 rolling summary; '' until the first compaction. Not `required`:
   * Mongoose's String required-validator rejects empty strings, and an empty
   * summary is the valid initial state, so the default carries it instead.
   */
  @Prop({ type: String, default: '' }) summary!: string;
  /** Messages with seq <= this are folded into `summary`. */
  @Prop({ type: Number, required: true, default: 0 }) summarized_up_to_seq!: number;
  /** Monotonic message counter — the seq source. */
  @Prop({ type: Number, required: true, default: 0 }) last_seq!: number;

  @Prop({ type: String, default: null }) pending_card_batch_id!: string | null;

  /**
   * The job this conversation performs. `program_build` routes turns to the
   * build orchestrator; absent/null is an ordinary chat. Enumerated so a typo
   * can't tag a chat as a build.
   */
  @Prop({ type: String, enum: PURPOSES, default: null })
  purpose!: ConversationPurpose | null;
  /**
   * The program + week a `program_build` conversation is building. Stored as an
   * opaque sub-document; null for ordinary chats.
   */
  @Prop({ type: Object, default: null }) build_context!: BuildContext | null;

  /**
   * Staging buffer of captured-but-not-committed preference candidates. Stored
   * as opaque sub-documents (the neutral `PendingCandidate` shape lives in the
   * domain); flushed + cleared at an action point. Defaults to an empty array
   * so legacy rows read as "no pending candidates".
   */
  @Prop({ type: [Object], default: [] }) pending_candidates!: unknown[];

  @Prop({ type: String, default: null }) closed_at!: string | null;
}

export const ConversationSchema = SchemaFactory.createForClass(ConversationDoc);

// List a user's conversations (sidebar), newest activity first.
ConversationSchema.index({ user_id: 1, updated_at: -1 });
// List only the active ones / idle-sweep for session_flush.
ConversationSchema.index({ user_id: 1, status: 1, updated_at: -1 });
// Global idle sweep across tenants (cron teardown).
ConversationSchema.index({ status: 1, updated_at: 1 });
