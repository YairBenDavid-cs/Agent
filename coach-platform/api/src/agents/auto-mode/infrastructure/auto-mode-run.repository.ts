import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../../common/infrastructure/base-tenant.repository';
import {
  AutoModeDiff,
  AutoModeRun,
} from '../domain/auto-mode-run.model';
import {
  AutoModeRunRepositoryPort,
  NewAutoModeRun,
} from '../domain/auto-mode-run.repository.port';
import { AutoModeRunDoc } from './auto-mode-run.schema';

type Lean = AutoModeRunDoc & { _id: unknown; createdAt?: Date };

@Injectable()
export class AutoModeRunRepository
  extends BaseTenantRepository<AutoModeRunDoc>
  implements AutoModeRunRepositoryPort
{
  constructor(
    @InjectModel(AutoModeRunDoc.name) model: Model<AutoModeRunDoc>,
  ) {
    super(model);
  }

  async create(input: NewAutoModeRun): Promise<AutoModeRun> {
    const doc = await this.model.create({
      user_id: input.userId,
      program_id: input.programId,
      week_index: input.weekIndex,
      scenario: input.scenario,
      trigger: input.trigger,
      conversation_id: input.conversationId,
      status: 'running',
      trace: [],
      before_snapshot: input.beforeSnapshot,
      diff: null,
      started_at: new Date().toISOString(),
    });
    return toDomain(doc.toObject() as Lean);
  }

  async findByIdScoped(
    userId: string,
    id: string,
  ): Promise<AutoModeRun | null> {
    const doc = (await this.findOneScoped(userId, { _id: id })) as
      | Lean
      | null;
    return doc ? toDomain(doc) : null;
  }

  async findRecent(userId: string, limit: number): Promise<AutoModeRun[]> {
    const docs = (await this.findManyScoped(
      userId,
      {},
      { createdAt: -1 },
      limit,
    )) as Lean[];
    return docs.map(toDomain);
  }

  async appendTrace(
    id: string,
    entry: { node: string; summary: string },
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $push: {
            trace: { node: entry.node, at: new Date().toISOString(), summary: entry.summary },
          },
        },
      )
      .exec();
  }

  async markStarted(id: string): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { started_at: new Date().toISOString() } })
      .exec();
  }

  async markCommitted(id: string, diff: AutoModeDiff): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            status: 'committed',
            diff,
            // A committed run has, by definition, persisted its changes.
            writes_performed: true,
            completed_at: new Date().toISOString(),
          },
        },
      )
      .exec();
  }

  async markAborted(id: string, reason: string): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            status: 'aborted',
            failure_reason: reason,
            completed_at: new Date().toISOString(),
          },
        },
      )
      .exec();
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            status: 'failed',
            failure_reason: reason,
            completed_at: new Date().toISOString(),
          },
        },
      )
      .exec();
  }

  async markWriteAudit(
    id: string,
    audit: { writesPerformed: boolean; reverted: boolean },
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            writes_performed: audit.writesPerformed,
            reverted: audit.reverted,
          },
        },
      )
      .exec();
  }

  async findStaleRunning(
    olderThanMs: number,
    limit: number,
  ): Promise<AutoModeRun[]> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const docs = (await this.model
      .find({
        status: 'running',
        started_at: { $ne: null, $lte: cutoff },
      })
      .sort({ started_at: 1 })
      .limit(limit)
      .lean()
      .exec()) as Lean[];
    return docs.map(toDomain);
  }
}

function toDomain(d: Lean): AutoModeRun {
  return {
    id: String(d._id),
    userId: d.user_id,
    programId: d.program_id,
    weekIndex: d.week_index,
    scenario: d.scenario,
    trigger: d.trigger,
    conversationId: d.conversation_id,
    status: d.status,
    trace: (d.trace ?? []).map((t) => ({ node: t.node, at: t.at, summary: t.summary })),
    beforeSnapshot: d.before_snapshot ?? null,
    diff: (d.diff as AutoModeDiff | null) ?? null,
    failureReason: d.failure_reason ?? null,
    writesPerformed: d.writes_performed ?? false,
    reverted: d.reverted ?? false,
    createdAt: (d.createdAt ?? new Date()).toISOString(),
    startedAt: d.started_at ?? null,
    completedAt: d.completed_at ?? null,
  };
}
