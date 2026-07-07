import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import {
  CalendarSync,
  PlannedOutcome,
  PlannedSession,
  PlannedSessionType,
  SessionDiff,
} from '../domain/planned-session.model';
import {
  PlannedSessionRepositoryPort,
  SessionContent,
  SessionSchedule,
} from '../domain/planned-session.repository.port';
import {
  calendarToPersistence,
  contentToPersistence,
  diffToPersistence,
  outcomeToPersistence,
  PlannedSessionLean,
  toDomain,
  toPersistence,
} from './planned-session.persistence-mapper';
import { PlannedSessionDoc } from './planned-session.schema';

@Injectable()
export class PlannedSessionRepository
  extends BaseTenantRepository<PlannedSessionDoc>
  implements PlannedSessionRepositoryPort
{
  constructor(
    @InjectModel(PlannedSessionDoc.name) model: Model<PlannedSessionDoc>,
  ) {
    super(model);
  }

  /**
   * Replace one program week's TENTATIVE draft in place. Keyed on the unique
   * {program_id, week_index, slot_key}, it overwrites the content of an existing
   * tentative slot (`$set`, so the `_id` — and every id-keyed reference to it,
   * e.g. revision preference events — survives a re-plan) and inserts genuinely
   * new slots. Two invariants are upheld:
   *
   *  - committed / outcome-bearing slots are NEVER touched (excluded from both
   *    the write set and the orphan delete), so an approved or already-logged
   *    train is never clobbered by a content re-plan;
   *  - slots the re-plan no longer includes are dropped, so a revision that
   *    REMOVES a session ("cut Friday's run") doesn't leave the stale row behind.
   *
   * Returns the number of slots written (overwritten or inserted).
   */
  async replaceTentativeWeek(sessions: PlannedSession[]): Promise<number> {
    if (sessions.length === 0) {
      return 0;
    }
    // Handler invariant: every session shares one tenant + program + week.
    const { userId, programId, weekIndex } = sessions[0];

    // Slots that must survive untouched: committed, or any non-`planned`
    // outcome (already logged/matched), even while still tentative.
    const protectedDocs = (await this.findManyScoped(
      userId,
      {
        program_id: programId,
        week_index: weekIndex,
        $or: [
          { plan_state: 'committed' },
          { 'outcome.status': { $ne: 'planned' } },
        ],
      },
      { slot_key: 1 },
    )) as PlannedSessionLean[];
    const protectedSlots = new Set(protectedDocs.map((d) => d.slot_key));

    const writable = sessions.filter((s) => !protectedSlots.has(s.slotKey));
    const incomingSlots = writable.map((s) => s.slotKey);

    if (writable.length > 0) {
      const ops = writable.map((s) => ({
        updateOne: {
          filter: {
            program_id: s.programId,
            week_index: s.weekIndex,
            slot_key: s.slotKey,
          },
          update: { $set: toPersistence(s) },
          upsert: true,
        },
      }));
      await this.model.bulkWrite(ops, { ordered: false });
    }

    // Drop tentative, not-yet-resolved slots this re-plan no longer includes.
    await this.model
      .deleteMany(
        this.scoped(userId, {
          program_id: programId,
          week_index: weekIndex,
          plan_state: 'tentative',
          'outcome.status': 'planned',
          slot_key: { $nin: incomingSlots },
        }),
      )
      .exec();

    return writable.length;
  }

  async findByDateRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<PlannedSession[]> {
    const docs = (await this.findManyScoped(
      userId,
      { scheduled_date: { $gte: from, $lte: to } },
      { scheduled_date: 1, start_time: 1 },
    )) as PlannedSessionLean[];
    return docs.map(toDomain);
  }

  async findByWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<PlannedSession[]> {
    const docs = (await this.findManyScoped(
      userId,
      { program_id: programId, week_index: weekIndex },
      { scheduled_date: 1, start_time: 1 },
    )) as PlannedSessionLean[];
    return docs.map(toDomain);
  }

  async findPastDuePlanned(
    userId: string,
    onOrBeforeDate: string,
  ): Promise<PlannedSession[]> {
    const docs = (await this.findManyScoped(
      userId,
      { 'outcome.status': 'planned', scheduled_date: { $lte: onOrBeforeDate } },
      { scheduled_date: 1 },
    )) as PlannedSessionLean[];
    return docs.map(toDomain);
  }

  async findMatchCandidates(
    userId: string,
    type: PlannedSessionType,
    fromDate: string,
    toDate: string,
  ): Promise<PlannedSession[]> {
    const docs = (await this.findManyScoped(
      userId,
      {
        type,
        'outcome.status': 'planned',
        scheduled_date: { $gte: fromDate, $lte: toDate },
      },
      { scheduled_date: -1 },
    )) as PlannedSessionLean[];
    return docs.map(toDomain);
  }

  async findById(
    userId: string,
    plannedSessionId: string,
  ): Promise<PlannedSession | null> {
    const doc = (await this.findOneScoped(userId, {
      _id: plannedSessionId,
    })) as PlannedSessionLean | null;
    return doc ? toDomain(doc) : null;
  }

  async commitWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<number> {
    const res = await this.model
      .updateMany(
        this.scoped(userId, {
          program_id: programId,
          week_index: weekIndex,
          plan_state: 'tentative',
        }),
        { $set: { plan_state: 'committed' } },
      )
      .exec();
    return res.modifiedCount ?? 0;
  }

  async commitSession(
    userId: string,
    plannedSessionId: string,
    lastDiff: SessionDiff,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: plannedSessionId }), {
        $set: {
          plan_state: 'committed',
          last_diff: diffToPersistence(lastDiff),
        },
      })
      .exec();
  }

  async discardTentativeWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<number> {
    const res = await this.model
      .deleteMany(
        this.scoped(userId, {
          program_id: programId,
          week_index: weekIndex,
          plan_state: 'tentative',
        }),
      )
      .exec();
    return res.deletedCount ?? 0;
  }

  async updateOutcome(
    userId: string,
    plannedSessionId: string,
    outcome: PlannedOutcome,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: plannedSessionId }), {
        $set: { outcome: outcomeToPersistence(outcome) },
      })
      .exec();
  }

  async updateSchedule(
    userId: string,
    plannedSessionId: string,
    schedule: SessionSchedule,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: plannedSessionId }), {
        $set: {
          scheduled_date: schedule.scheduledDate,
          start_time: schedule.startTime,
          end_time: schedule.endTime,
          timezone: schedule.timezone,
          scheduled_start_utc: schedule.scheduledStartUtc,
        },
      })
      .exec();
  }

  async updateContent(
    userId: string,
    plannedSessionId: string,
    content: SessionContent,
    lastDiff: SessionDiff,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: plannedSessionId }), {
        $set: {
          ...contentToPersistence(content),
          last_diff: diffToPersistence(lastDiff),
        },
      })
      .exec();
  }

  async updateCalendarSync(
    userId: string,
    plannedSessionId: string,
    calendarSync: CalendarSync,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: plannedSessionId }), {
        $set: { calendar_sync: calendarToPersistence(calendarSync) },
      })
      .exec();
  }
}
