import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DraftKind } from '../approval-ttl.policy';
import { CardBatchStatus } from '../domain/pending-card-batch.model';

export type PendingCardBatchDocument = HydratedDocument<PendingCardBatchDoc>;

const KINDS: DraftKind[] = ['session_day', 'user_initiated'];
const STATUSES: CardBatchStatus[] = [
  'pending',
  'approved',
  'revised',
  'rejected',
  'superseded',
  'expired',
  'auto_committed',
];

@Schema({ collection: 'pending_card_batches', timestamps: true })
export class PendingCardBatchDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, required: true }) program_id!: string;
  @Prop({ type: Number, required: true }) week_index!: number;
  @Prop({ type: String, required: true, enum: KINDS }) kind!: DraftKind;
  @Prop({ type: String, required: true, enum: STATUSES, default: 'pending' })
  status!: CardBatchStatus;
  @Prop({ type: String, required: true }) run_id!: string;
  @Prop({ type: String, default: null }) conversation_id!: string | null;
  @Prop({ type: String, default: null }) session_start_utc!: string | null;
}

export const PendingCardBatchSchema =
  SchemaFactory.createForClass(PendingCardBatchDoc);

// Address a user's batch by id (the default _id index covers find-by-id, but we
// always co-scope by user_id for tenant isolation).
PendingCardBatchSchema.index({ user_id: 1, status: 1, updatedAt: -1 });
// Supersession lookup: the live pending batch for a given week.
PendingCardBatchSchema.index({ user_id: 1, program_id: 1, week_index: 1, status: 1 });
// Global TTL sweep across tenants (cron), oldest pending first.
PendingCardBatchSchema.index({ status: 1, createdAt: 1 });
