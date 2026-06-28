import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ActiveProgramResponse,
} from '../../program/application/dto/program.response';
import { GetActiveProgramQuery } from '../../program/application/queries/get-active-program.query';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import { UserResponse } from '../../users/application/dto/user.response';
import { GetUserQuery } from '../../users/application/queries/get-user.query';

/** Everything a pipeline run needs, resolved deterministically from state. */
export interface ResolvedRunContext {
  programId: string;
  discipline: EventDiscipline;
  timezone: string;
  weekIndex: number;
  weekWindow: { from: string; to: string };
}

/**
 * Assembles a `PipelineRunContext`'s domain facts (discipline, timezone, the
 * current week's window + index) from the active program and the user. Triggers
 * (fetch, outcome, revision) all need this same resolution, so it lives in one
 * tested place rather than being re-derived per trigger. Returns null when the
 * user has no active program or no current week — the caller then no-ops.
 */
@Injectable()
export class TriggerContextResolver {
  constructor(private readonly queryBus: QueryBus) {}

  async resolve(userId: string): Promise<ResolvedRunContext | null> {
    const [program, user] = await Promise.all([
      this.queryBus.execute<GetActiveProgramQuery, ActiveProgramResponse>(
        new GetActiveProgramQuery(userId),
      ),
      this.queryBus.execute<GetUserQuery, UserResponse>(
        new GetUserQuery(userId),
      ),
    ]);

    const p = program.program;
    if (!p) {
      return null;
    }
    const week = p.weeks.find((w) => w.weekIndex === p.currentWeekIndex);
    if (!week) {
      return null;
    }

    return {
      programId: p.id,
      discipline: p.discipline,
      timezone: user.timezone ?? 'UTC',
      weekIndex: p.currentWeekIndex,
      weekWindow: { from: week.startDate, to: week.endDate },
    };
  }
}
