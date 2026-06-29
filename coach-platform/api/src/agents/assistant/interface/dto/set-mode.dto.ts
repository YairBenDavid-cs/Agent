import { IsIn } from 'class-validator';
import { ConversationMode } from '../../../conversation/domain/conversation.model';

/** Toggle a conversation between Plan (mutating) and Ask (read-only) mode. */
export class SetModeDto {
  @IsIn(['plan', 'ask'])
  mode!: ConversationMode;
}
