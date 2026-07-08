import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConversationMode } from '../../../conversation/domain/conversation.model';

/** Optionally name a new conversation; the title is a UI affordance only. */
export class StartConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /**
   * Optional initial mode. Omitted → the repository's origin-based default
   * (user-opened chats start read-only `ask`). Lets the start screen open a
   * conversation directly in the mode the user picked before their first send.
   */
  @IsOptional()
  @IsIn(['plan', 'ask', 'auto'])
  mode?: ConversationMode;
}
