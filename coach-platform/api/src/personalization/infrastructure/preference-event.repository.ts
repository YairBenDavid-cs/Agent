import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { PreferenceEvent, PreferenceTagType } from '../domain/preference-event.model';
import {
  EventDisciplineFilter,
  PreferenceEventRepositoryPort,
} from '../domain/preference-event.repository.port';
import {
  PreferenceEventLean,
  toDomain,
  toPersistence,
} from './preference-event.persistence-mapper';
import { PreferenceEventDoc } from './preference-event.schema';

@Injectable()
export class PreferenceEventRepository
  extends BaseTenantRepository<PreferenceEventDoc>
  implements PreferenceEventRepositoryPort
{
  constructor(
    @InjectModel(PreferenceEventDoc.name) model: Model<PreferenceEventDoc>,
  ) {
    super(model);
  }

  async append(event: PreferenceEvent): Promise<string> {
    const created = await this.model.create(toPersistence(event));
    return created._id.toString();
  }

  async appendMany(events: PreferenceEvent[]): Promise<string[]> {
    if (events.length === 0) {
      return [];
    }
    const docs = await this.model.insertMany(events.map(toPersistence), {
      ordered: true,
    });
    return docs.map((d) => d._id.toString());
  }

  async findById(
    userId: string,
    eventId: string,
  ): Promise<PreferenceEvent | null> {
    const doc = (await this.findOneScoped(userId, {
      _id: eventId,
    })) as PreferenceEventLean | null;
    return doc ? toDomain(doc) : null;
  }

  async findRecent(
    userId: string,
    opts: { discipline?: EventDisciplineFilter; limit?: number } = {},
  ): Promise<PreferenceEvent[]> {
    const filter =
      opts.discipline !== undefined ? { discipline: opts.discipline } : {};
    const docs = (await this.findManyScoped(
      userId,
      filter,
      { event_date: -1 },
      opts.limit ?? 10,
    )) as PreferenceEventLean[];
    return docs.map(toDomain);
  }

  async findByBatch(
    userId: string,
    batchId: string,
  ): Promise<PreferenceEvent[]> {
    const docs = (await this.findManyScoped(
      userId,
      { batch_id: batchId },
      { event_date: 1 },
    )) as PreferenceEventLean[];
    return docs.map(toDomain);
  }

  async findActiveOneOffs(
    userId: string,
    discipline: EventDisciplineFilter,
    nowIso: string,
  ): Promise<PreferenceEvent[]> {
    const docs = (await this.findManyScoped(
      userId,
      {
        durability: 'one_off',
        discipline: { $in: [discipline, null] },
        consumed_at: null,
        $or: [{ expires_at: null }, { expires_at: { $gte: nowIso } }],
      },
      { event_date: -1 },
    )) as PreferenceEventLean[];
    return docs.map(toDomain);
  }

  async findRecentStanding(
    userId: string,
    discipline: EventDisciplineFilter,
    limit: number,
  ): Promise<PreferenceEvent[]> {
    const docs = (await this.findManyScoped(
      userId,
      { durability: 'standing', discipline: { $in: [discipline, null] } },
      { event_date: -1 },
      limit,
    )) as PreferenceEventLean[];
    return docs.map(toDomain);
  }

  async findByTagType(
    userId: string,
    tagType: PreferenceTagType,
  ): Promise<PreferenceEvent[]> {
    const docs = (await this.findManyScoped(
      userId,
      { 'tag.type': tagType },
      { event_date: -1 },
    )) as PreferenceEventLean[];
    return docs.map(toDomain);
  }

  async findAllForReplay(
    userId: string,
    discipline?: EventDisciplineFilter,
  ): Promise<PreferenceEvent[]> {
    const filter = discipline !== undefined ? { discipline } : {};
    const docs = (await this.findManyScoped(userId, filter, {
      event_date: 1,
    })) as PreferenceEventLean[];
    return docs.map(toDomain);
  }
}
