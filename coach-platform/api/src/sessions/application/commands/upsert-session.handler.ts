import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { contentHash } from '../../../common/util/content-hash';
import {
  SESSIONS_REPOSITORY,
  SessionsRepositoryPort,
} from '../../domain/sessions.repository.port';
import { WorkoutSession } from '../../domain/workout-session.model';
import { UpsertResult, UpsertSessionCommand } from './upsert-session.command';

@CommandHandler(UpsertSessionCommand)
export class UpsertSessionHandler
  implements ICommandHandler<UpsertSessionCommand, UpsertResult>
{
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly repository: SessionsRepositoryPort,
  ) {}

  async execute(command: UpsertSessionCommand): Promise<UpsertResult> {
    const hash = contentHash({
      type: command.type,
      subtype: command.subtype,
      running: command.running,
      strength: command.strength,
    });
    const existing = await this.repository.getContentHash(
      command.userId,
      command.activityId,
    );
    if (existing === hash) {
      return { written: false };
    }

    const session: WorkoutSession = {
      userId: command.userId,
      activityId: command.activityId,
      date: command.date,
      type: command.type,
      subtype: command.subtype,
      source: command.source,
      contentHash: hash,
      running: command.running,
      strength: command.strength,
    };
    await this.repository.upsertSession(session);
    return { written: true };
  }
}
