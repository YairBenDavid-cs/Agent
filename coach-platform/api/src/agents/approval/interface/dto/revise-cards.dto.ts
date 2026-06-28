import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** One per-card comment: the session it targets + the user's verbatim edit. */
export class CardRevisionEditDto {
  @IsString() plannedSessionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  freeText!: string;
}

/**
 * Submit a week's worth of per-card revisions together (NotebookLM batch model).
 * Each edit's raw text is preserved verbatim on a one-off preference event; the
 * Coach interprets it as a hard constraint at regeneration — there is no
 * separate extraction step.
 */
export class ReviseCardsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CardRevisionEditDto)
  edits!: CardRevisionEditDto[];
}
