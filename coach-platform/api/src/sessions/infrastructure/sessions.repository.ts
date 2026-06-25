import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { SessionsRepositoryPort } from '../domain/sessions.repository.port';
import {
  SessionType,
  WorkoutSession,
} from '../domain/workout-session.model';
import { WorkoutSessionDoc } from './session.schema';

const toPersistence = (s: WorkoutSession): WorkoutSessionDoc => ({
  user_id: s.userId,
  activity_id: s.activityId,
  date: s.date,
  type: s.type,
  subtype: s.subtype,
  source: s.source,
  content_hash: s.contentHash,
  running: s.running,
  strength: s.strength,
});

const toDomain = (doc: WorkoutSessionDoc): WorkoutSession => ({
  userId: doc.user_id,
  activityId: doc.activity_id,
  date: doc.date,
  type: doc.type,
  subtype: doc.subtype,
  source: doc.source,
  contentHash: doc.content_hash,
  running: doc.running ?? null,
  strength: doc.strength ?? null,
});

@Injectable()
export class SessionsRepository
  extends BaseTenantRepository<WorkoutSessionDoc>
  implements SessionsRepositoryPort
{
  constructor(
    @InjectModel(WorkoutSessionDoc.name) model: Model<WorkoutSessionDoc>,
  ) {
    super(model);
  }

  async upsertSession(session: WorkoutSession): Promise<void> {
    await this.upsertScoped(
      session.userId,
      { activity_id: session.activityId },
      { $set: toPersistence(session) },
    );
  }

  async getContentHash(
    userId: string,
    activityId: number,
  ): Promise<string | null> {
    const doc = await this.findOneScoped(userId, { activity_id: activityId });
    return doc?.content_hash ?? null;
  }

  async findRange(
    userId: string,
    from: string,
    to: string,
    type: SessionType | null,
    afterActivityId: number | null,
    limit: number,
  ): Promise<WorkoutSession[]> {
    const filter: FilterQuery<WorkoutSessionDoc> = {
      date: { $gte: from, $lte: to },
    };
    if (type) {
      filter.type = type;
    }
    if (afterActivityId !== null) {
      filter.activity_id = { $lt: afterActivityId };
    }
    const docs = await this.findManyScoped(
      userId,
      filter,
      { date: -1, activity_id: -1 },
      limit,
    );
    return docs.map(toDomain);
  }
}
