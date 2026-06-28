import { HttpStatus, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError, ErrorCode } from '../../../common/errors/api-error';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import {
  UpsertWeekSessionsCommand,
  UpsertWeekSessionsResult,
} from './upsert-week-sessions.command';

/**
 * Persists a week's tentative planned trains via the idempotent bulk insert.
 * Enforces the two write invariants the agent tier promises: every train is
 * `tentative` and carries a non-empty `coachNotes` rationale. Tenant scoping is
 * intrinsic — each session already carries the caller's `userId`.
 */
@CommandHandler(UpsertWeekSessionsCommand)
export class UpsertWeekSessionsHandler
  implements ICommandHandler<UpsertWeekSessionsCommand, UpsertWeekSessionsResult>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(
    command: UpsertWeekSessionsCommand,
  ): Promise<UpsertWeekSessionsResult> {
    const { userId, sessions } = command;

    for (const session of sessions) {
      if (session.userId !== userId) {
        throw new ApiError(
          HttpStatus.FORBIDDEN,
          ErrorCode.VALIDATION_FAILED,
          'Planned session userId mismatch.',
          { slotKey: session.slotKey },
        );
      }
      if (session.planState !== 'tentative') {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          ErrorCode.VALIDATION_FAILED,
          'Coach-authored sessions must be tentative until approval.',
          { slotKey: session.slotKey },
        );
      }
      if (!session.coachNotes || session.coachNotes.trim().length === 0) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          ErrorCode.VALIDATION_FAILED,
          'Every planned train must carry coachNotes.',
          { slotKey: session.slotKey },
        );
      }
    }

    const inserted = await this.repository.insertMany(sessions);
    return { inserted, requested: sessions.length };
  }
}
