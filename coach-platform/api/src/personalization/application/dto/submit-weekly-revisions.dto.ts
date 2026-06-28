import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { PreferenceItemDto } from './preference-item.dto';

/**
 * NotebookLM-style weekly submit: every card comment/revision the user made
 * during the week, sent together. All items share one `batchId` so the diff can
 * be replayed (and the future regeneration keyed off it) as a unit.
 */
export class SubmitWeeklyRevisionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  revisions!: PreferenceItemDto[];
}
