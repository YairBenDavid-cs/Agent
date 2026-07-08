import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { getActiveSession } from '../../common/transaction/transaction.context';
import {
  Program,
  WeeklyTargets,
  WeeklyTargetsRevision,
} from '../domain/program.model';
import { ProgramRepositoryPort } from '../domain/program.repository.port';
import {
  ProgramLean,
  toDomain,
  toPersistence,
} from './program.persistence-mapper';
import { ProgramDoc } from './program.schema';

@Injectable()
export class ProgramRepository
  extends BaseTenantRepository<ProgramDoc>
  implements ProgramRepositoryPort
{
  constructor(@InjectModel(ProgramDoc.name) model: Model<ProgramDoc>) {
    super(model);
  }

  async findActive(userId: string): Promise<Program | null> {
    const doc = (await this.findOneScoped(userId, {
      status: 'active',
    })) as ProgramLean | null;
    return doc ? toDomain(doc) : null;
  }

  async findById(userId: string, programId: string): Promise<Program | null> {
    const doc = (await this.findOneScoped(userId, {
      _id: programId,
    })) as ProgramLean | null;
    return doc ? toDomain(doc) : null;
  }

  /**
   * Archive-then-insert. Both writes enroll in the ambient transaction (started
   * by the command handler), so the partial-unique index on active programs is
   * never violated. Returns the new program's id.
   */
  async replaceActive(program: Program): Promise<string> {
    const session = getActiveSession();

    await this.model
      .updateMany(
        this.scoped(program.userId, { status: 'active' }),
        { $set: { status: 'completed' } },
        { session },
      )
      .exec();

    const [created] = await this.model.create([toPersistence(program)], {
      session,
    });
    return created._id.toString();
  }

  async updateWeeks(
    userId: string,
    programId: string,
    weeks: Program['weeks'],
    currentWeekIndex: number,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: programId }), {
        $set: {
          weeks: weeks.map((w) => ({
            week_index: w.weekIndex,
            start_date: w.startDate,
            end_date: w.endDate,
            theme: w.theme,
            planned_load_target: w.plannedLoadTarget,
            plan_state: w.planState,
            status: w.status,
            generated_at: w.generatedAt,
            week_state: w.weekState ?? 'open',
            weekly_targets: w.weeklyTargets
              ? {
                  session_count: w.weeklyTargets.sessionCount,
                  total_volume: w.weeklyTargets.totalVolume,
                  key_goals: w.weeklyTargets.keyGoals,
                  locked_at: w.weeklyTargets.lockedAt,
                  revision_history: (
                    w.weeklyTargets.revisionHistory ?? []
                  ).map((r) => ({
                    revised_at: r.revisedAt,
                    previous_session_count: r.previous.sessionCount,
                    previous_total_volume: r.previous.totalVolume,
                    previous_key_goals: r.previous.keyGoals,
                    reason: r.reason,
                    triggered_by: r.triggeredBy,
                  })),
                }
              : null,
          })),
          current_week_index: currentWeekIndex,
        },
      })
      .exec();
  }

  /**
   * Stage a tentative Step-A proposal: stamp `weekly_targets` with
   * `locked_at: null` while leaving `week_state` at 'open'. The conversational
   * build proposes a quota the user can still revise before it is locked.
   * Positional update on the matching `weeks[]` entry.
   */
  async proposeWeeklyTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    targets: { sessionCount: number; totalVolume: number; keyGoals: string[] },
  ): Promise<void> {
    await this.model
      .updateOne(
        this.scoped(userId, {
          _id: programId,
          'weeks.week_index': weekIndex,
        }),
        {
          $set: {
            'weeks.$.weekly_targets': {
              session_count: targets.sessionCount,
              total_volume: targets.totalVolume,
              key_goals: targets.keyGoals,
              locked_at: null,
              revision_history: [],
            },
          },
        },
      )
      .exec();
  }

  /**
   * Freeze Step A on a single week: stamp the weekly quota and flip
   * `week_state` to 'targets_locked'. Targeted positional update on the matching
   * `weeks[]` entry, so sibling weeks and the rest of the doc are untouched.
   */
  async lockWeeklyTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    targets: WeeklyTargets,
  ): Promise<void> {
    await this.model
      .updateOne(
        this.scoped(userId, {
          _id: programId,
          'weeks.week_index': weekIndex,
        }),
        {
          $set: {
            'weeks.$.week_state': 'targets_locked',
            'weeks.$.weekly_targets': {
              session_count: targets.sessionCount,
              total_volume: targets.totalVolume,
              key_goals: targets.keyGoals,
              locked_at: targets.lockedAt,
              revision_history: [],
            },
          },
        },
      )
      .exec();
  }

  /**
   * Revise a `targets_locked`/`locked` week's quota in place: `week_state` is
   * untouched, and `revision` is appended to `revision_history` so the prior
   * quota is preserved rather than overwritten. Targeted field-level update so
   * a concurrent write to a sibling field on the same week entry is not clobbered.
   */
  async reviseWeeklyTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    targets: Pick<WeeklyTargets, 'sessionCount' | 'totalVolume' | 'keyGoals'>,
    revision: WeeklyTargetsRevision,
  ): Promise<void> {
    await this.model
      .updateOne(
        this.scoped(userId, {
          _id: programId,
          'weeks.week_index': weekIndex,
        }),
        {
          $set: {
            'weeks.$.weekly_targets.session_count': targets.sessionCount,
            'weeks.$.weekly_targets.total_volume': targets.totalVolume,
            'weeks.$.weekly_targets.key_goals': targets.keyGoals,
          },
          $push: {
            'weeks.$.weekly_targets.revision_history': {
              revised_at: revision.revisedAt,
              previous_session_count: revision.previous.sessionCount,
              previous_total_volume: revision.previous.totalVolume,
              previous_key_goals: revision.previous.keyGoals,
              reason: revision.reason,
              triggered_by: revision.triggeredBy,
            },
          },
        },
      )
      .exec();
  }

  /**
   * Atomic acquire/release of the per-week autonomous-run lock. Acquire
   * (`lock` set) matches weeks where the lock is currently absent OR already
   * held by the same runId, so a retry from the same run is idempotent.
   * Release (`lock` null) matches only when `expectedRunId` still holds it,
   * so a stale/aborted run can never clear a lock it no longer owns.
   * `modifiedCount === 1` tells the caller whether it actually won the lock.
   */
  async setWeekRunLock(
    userId: string,
    programId: string,
    weekIndex: number,
    lock: { runId: string; lockedAt: string } | null,
    expectedRunId?: string,
  ): Promise<boolean> {
    const ownershipFilter = lock
      ? {
          $or: [
            { 'weeks.run_lock_id': null },
            { 'weeks.run_lock_id': lock.runId },
          ],
        }
      : { 'weeks.run_lock_id': expectedRunId ?? null };

    const result = await this.model
      .updateOne(
        {
          ...this.scoped(userId, {
            _id: programId,
            'weeks.week_index': weekIndex,
          }),
          ...ownershipFilter,
        },
        {
          $set: {
            'weeks.$.run_lock_id': lock ? lock.runId : null,
            'weeks.$.run_locked_at': lock ? lock.lockedAt : null,
          },
        },
      )
      .exec();
    return result.modifiedCount === 1;
  }
}
