import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * One user turn in a conversation. The body carries ONLY the text — identity is
 * taken from the authenticated user and the conversation from the route param,
 * never from the client payload (tenant safety). The 4000-char cap mirrors the
 * USER token budget in the context assembler (~2000 tokens at ~4 chars/token,
 * with headroom) so a single turn can never blow the working-memory budget.
 */
export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}
