import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { getActiveSession } from '../../common/transaction/transaction.context';
import { Program, WeeklyTargets } from '../domain/program.model';
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
            },
          },
        },
      )
      .exec();
  }
}
