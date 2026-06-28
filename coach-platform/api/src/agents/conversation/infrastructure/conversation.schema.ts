import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ConversationStatus } from '../domain/conversation.model';

export type ConversationDocument = HydratedDocument<ConversationDoc>;

const STATUSES = ['active', 'closed'];

@Schema({ collection: 'conversations', timestamps: true })
export class ConversationDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, default: null }) title!: string | null;
  @Prop({ type: String, required: true, enum: STATUSES, default: 'active' })
  status!: ConversationStatus;

  /** Tier-3 rolling summary; '' until the first compaction. */
  @Prop({ type: String, required: true, default: '' }) summary!: string;
  /** Messages with seq <= this are folded into `summary`. */
  @Prop({ type: Number, required: true, default: 0 }) summarized_up_to_seq!: number;
  /** Monotonic message counter — the seq source. */
  @Prop({ type: Number, required: true, default: 0 }) last_seq!: number;

  @Prop({ type: String, default: null }) pending_card_batch_id!: string | null;
  @Prop({ type: String, default: null }) closed_at!: string | null;
}

export const ConversationSchema = SchemaFactory.createForClass(ConversationDoc);

// List a user's conversations (sidebar), newest activity first.
ConversationSchema.index({ user_id: 1, updated_at: -1 });
// List only the active ones / idle-sweep for session_flush.
ConversationSchema.index({ user_id: 1, status: 1, updated_at: -1 });
// Global idle sweep across tenants (cron teardown).
ConversationSchema.index({ status: 1, updated_at: 1 });
