import { PreferenceItemDto } from '../dto/preference-item.dto';

/**
 * Persist the distilled net-intent preferences from a chat action point as one
 * batch (`source='chat'`). Replaces the per-turn single `save_preference` write
 * (`CaptureAssistantPreferenceCommand`) for the action-point flush path: the
 * distillation pass already collapsed the iteration history, so the surviving
 * items are written together and the projection rebuilds once.
 */
export class CaptureChatPreferencesCommand {
  constructor(
    public readonly userId: string,
    public readonly items: PreferenceItemDto[],
  ) {}
}
