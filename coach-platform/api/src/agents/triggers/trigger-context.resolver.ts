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

  /**
   * Chat variant of `resolve`: pins `weekIndex`/`weekWindow` to whichever
   * skeleton week's date range actually contains today, falling back to
   * `currentWeekIndex` only when no week matches (before the program starts,
   * or past its last week). `currentWeekIndex` is a build pointer — a
   * scheduled build can lock and advance it onto next week before that week's
   * `startDate` actually arrives, which would otherwise make "what's my
   * session this week?" answer from a week that hasn't started yet.
   */
  async resolveForChat(userId: string): Promise<ResolvedRunContext | null> {
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
    const timezone = user.timezone ?? 'UTC';
    const today = localDateInTimezone(timezone);
    const week =
      p.weeks.find((w) => w.startDate <= today && today <= w.endDate) ??
      p.weeks.find((w) => w.weekIndex === p.currentWeekIndex);
    if (!week) {
      return null;
    }

    return {
      programId: p.id,
      discipline: p.discipline,
      timezone,
      weekIndex: week.weekIndex,
      weekWindow: { from: week.startDate, to: week.endDate },
    };
  }
}

/** Today's local date (YYYY-MM-DD) in the given IANA timezone. */
function localDateInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
