import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import {
  CalendarSync,
  PlannedOutcome,
  PlannedSession,
  PlannedSessionType,
} from '../domain/planned-session.model';
import {
  PlannedSessionRepositoryPort,
  SessionSchedule,
} from '../domain/planned-session.repository.port';
import {
  calendarToPersistence,
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
   * Idempotent bulk insert via upsert keyed on the unique
   * {program_id, week_index, slot_key}. `$setOnInsert` means an existing train
   * (possibly already committed/outcome-bearing) is never clobbered. Returns the
   * number of new docs created.
   */
  async insertMany(sessions: PlannedSession[]): Promise<number> {
    if (sessions.length === 0) {
      return 0;
    }
    const ops = sessions.map((s) => ({
      updateOne: {
        filter: {
          program_id: s.programId,
          week_index: s.weekIndex,
          slot_key: s.slotKey,
        },
        update: { $setOnInsert: toPersistence(s) },
        upsert: true,
      },
    }));
    const res = await this.model.bulkWrite(ops, { ordered: false });
    return res.upsertedCount ?? 0;
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
