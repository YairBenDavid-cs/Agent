import { IsISO8601, IsString } from 'class-validator';

/**
 * The user's calendar-slot pick on a `program_build` conversation. The client
 * sends back the chosen candidate's `scheduledStartUtc` (the stable identity of
 * a proposed slot, surfaced in the assistant turn's `meta.slotProposal`); the
 * server re-validates it against the live calendar before writing. Identity +
 * conversation come from the JWT / route, never the payload (tenant safety).
 */
export class ConfirmSlotDto {
  @IsString()
  @IsISO8601()
  scheduledStartUtc!: string;
}
