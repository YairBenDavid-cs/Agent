import { PreferenceItemDto } from '../dto/preference-item.dto';

/**
 * The `save_preference` tool: the assistant captures one preference mid-chat.
 * Single item, source = assistant, no batch.
 */
export class CaptureAssistantPreferenceCommand {
  constructor(
    public readonly userId: string,
    public readonly item: PreferenceItemDto,
  ) {}
}
