import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Optionally name a new conversation; the title is a UI affordance only. */
export class StartConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
