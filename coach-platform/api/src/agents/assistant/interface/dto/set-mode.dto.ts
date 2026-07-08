import { IsIn } from 'class-validator';
import { ConversationMode } from '../../../conversation/domain/conversation.model';

/** Toggle a conversation between Plan (mutating), Ask (read-only), and Auto (autonomous) mode. */
export class SetModeDto {
  @IsIn(['plan', 'ask', 'auto'])
  mode!: ConversationMode;
}
