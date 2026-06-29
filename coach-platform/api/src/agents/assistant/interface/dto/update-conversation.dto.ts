import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/** Rename a conversation. Trimmed, 1–60 chars after trimming. */
export class UpdateConversationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 60)
  title!: string;
}
