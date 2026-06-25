import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CollectionEnvelope } from '../../../common/dto/date-range.query';
import {
  RECOVERY_REPOSITORY,
  RecoveryRepositoryPort,
} from '../../domain/recovery.repository.port';
import { RecoveryDayResponse } from '../dto/recovery-day.response';
import { toRecoveryDayResponse } from '../recovery.mapper';
import { GetRecoveryRangeQuery } from './get-recovery-range.query';

@QueryHandler(GetRecoveryRangeQuery)
export class GetRecoveryRangeHandler
  implements
    IQueryHandler<
      GetRecoveryRangeQuery,
      CollectionEnvelope<RecoveryDayResponse>
    >
{
  constructor(
    @Inject(RECOVERY_REPOSITORY)
    private readonly repository: RecoveryRepositoryPort,
  ) {}

  async execute(
    query: GetRecoveryRangeQuery,
  ): Promise<CollectionEnvelope<RecoveryDayResponse>> {
    // Fetch one extra to know whether a further page exists.
    const days = await this.repository.findRange(
      query.userId,
      query.from,
      query.to,
      query.cursor,
      query.limit + 1,
    );

    const hasMore = days.length > query.limit;
    const page = hasMore ? days.slice(0, query.limit) : days;

    return {
      items: page.map(toRecoveryDayResponse),
      nextCursor: hasMore ? page[page.length - 1].date : null,
    };
  }
}
