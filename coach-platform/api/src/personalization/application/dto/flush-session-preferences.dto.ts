import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { PreferenceItemDto } from './preference-item.dto';

/**
 * Session-teardown flush: preferences the assistant accumulated during a chat
 * session but deferred writing until the session ends, persisted in one batch.
 * An empty list is valid (nothing worth keeping was said).
 */
export class FlushSessionPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  items!: PreferenceItemDto[];
}
