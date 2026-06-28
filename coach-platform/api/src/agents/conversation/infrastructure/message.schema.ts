import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MessageMeta, MessageRole } from '../domain/conversation.model';

export type MessageDocument = HydratedDocument<MessageDoc>;

const ROLES = ['user', 'assistant', 'system'];

@Schema({ collection: 'conversation_messages', timestamps: true })
export class MessageDoc {
  @Prop({ type: String, required: true }) conversation_id!: string;
  /** Denormalized for tenant scoping. */
  @Prop({ type: String, required: true }) user_id!: string;
  /** Monotonic within the conversation; ordering + cursor key. */
  @Prop({ type: Number, required: true }) seq!: number;
  @Prop({ type: String, required: true, enum: ROLES }) role!: MessageRole;
  @Prop({ type: String, required: true }) content!: string;
  /** Free-form structured action metadata on assistant turns; null otherwise. */
  @Prop({ type: Object, default: null }) meta!: MessageMeta | null;
}

export const MessageSchema = SchemaFactory.createForClass(MessageDoc);

// Ordered transcript fetch + cursor pagination + the after-seq assembly window.
MessageSchema.index({ conversation_id: 1, seq: 1 }, { unique: true });
// Tenant scoping safety net.
MessageSchema.index({ user_id: 1, conversation_id: 1, seq: 1 });
