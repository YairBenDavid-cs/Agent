import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../../common/infrastructure/base-tenant.repository';
import {
  CardBatchStatus,
  PendingCardBatch,
} from '../domain/pending-card-batch.model';
import {
  NewCardBatch,
  PendingCardBatchRepositoryPort,
} from '../domain/pending-card-batch.repository.port';
import { PendingCardBatchDoc } from './pending-card-batch.schema';

type BatchLean = PendingCardBatchDoc & {
  _id: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class PendingCardBatchRepository
  extends BaseTenantRepository<PendingCardBatchDoc>
  implements PendingCardBatchRepositoryPort
{
  constructor(
    @InjectModel(PendingCardBatchDoc.name)
    model: Model<PendingCardBatchDoc>,
  ) {
    super(model);
  }

  async createSuperseding(input: NewCardBatch): Promise<PendingCardBatch> {
    // Invalidate any still-pending draft for the same week first, so at most one
    // pending batch exists per (user, program, week) — the supersession rule.
    await this.model
      .updateMany(
        this.scoped(input.userId, {
          program_id: input.programId,
          week_index: input.weekIndex,
          status: 'pending',
        }),
        { $set: { status: 'superseded' } },
      )
      .exec();

    const doc = await this.model.create({
      user_id: input.userId,
      program_id: input.programId,
      week_index: input.weekIndex,
      kind: input.kind,
      status: 'pending',
      run_id: input.runId,
      conversation_id: input.conversationId,
      session_start_utc: input.sessionStartUtc,
      reason: input.reason,
    });
    return toBatch(doc.toObject() as BatchLean);
  }

  async findByIdScoped(
    userId: string,
    batchId: string,
  ): Promise<PendingCardBatch | null> {
    const doc = (await this.findOneScoped(userId, {
      _id: batchId,
    })) as BatchLean | null;
    return doc ? toBatch(doc) : null;
  }

  async findPending(userId: string): Promise<PendingCardBatch[]> {
    const docs = (await this.findManyScoped(
      userId,
      { status: 'pending' },
      { updatedAt: -1 },
    )) as BatchLean[];
    return docs.map(toBatch);
  }

  async setStatus(
    userId: string,
    batchId: string,
    status: CardBatchStatus,
  ): Promise<PendingCardBatch | null> {
    const doc = (await this.model
      .findOneAndUpdate(
        this.scoped(userId, { _id: batchId }),
        { $set: { status } },
        { new: true },
      )
      .lean()
      .exec()) as BatchLean | null;
    return doc ? toBatch(doc) : null;
  }

  async findAllPending(limit: number): Promise<PendingCardBatch[]> {
    const docs = (await this.model
      .find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean()
      .exec()) as BatchLean[];
    return docs.map(toBatch);
  }
}

function toBatch(d: BatchLean): PendingCardBatch {
  return {
    id: String(d._id),
    userId: d.user_id,
    programId: d.program_id,
    weekIndex: d.week_index,
    kind: d.kind,
    status: d.status,
    runId: d.run_id,
    conversationId: d.conversation_id,
    sessionStartUtc: d.session_start_utc,
    reason: d.reason ?? null,
    createdAt: (d.createdAt ?? new Date()).toISOString(),
    updatedAt: (d.updatedAt ?? new Date()).toISOString(),
  };
}
