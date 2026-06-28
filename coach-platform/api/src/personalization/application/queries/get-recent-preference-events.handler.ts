import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PreferenceEvent } from '../../domain/preference-event.model';
import {
  PREFERENCE_EVENT_REPOSITORY,
  PreferenceEventRepositoryPort,
} from '../../domain/preference-event.repository.port';
import { GetRecentPreferenceEventsQuery } from './get-recent-preference-events.query';

@QueryHandler(GetRecentPreferenceEventsQuery)
export class GetRecentPreferenceEventsHandler
  implements IQueryHandler<GetRecentPreferenceEventsQuery, PreferenceEvent[]>
{
  constructor(
    @Inject(PREFERENCE_EVENT_REPOSITORY)
    private readonly repository: PreferenceEventRepositoryPort,
  ) {}

  async execute(
    query: GetRecentPreferenceEventsQuery,
  ): Promise<PreferenceEvent[]> {
    return this.repository.findRecent(query.userId, {
      discipline: query.discipline,
      limit: query.limit,
    });
  }
}
