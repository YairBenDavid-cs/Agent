import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import {
  CollectionEnvelope,
  DateRangeQuery,
} from '../../common/dto/date-range.query';
import { RecoveryDayResponse } from '../application/dto/recovery-day.response';
import { GetRecoveryRangeQuery } from '../application/queries/get-recovery-range.query';

const DEFAULT_PAGE_LIMIT = 31;

@Controller('recovery')
export class RecoveryController {
  constructor(private readonly queryBus: QueryBus) {}

  /** GET /recovery/days?from=&to=&cursor= — the caller's own recovery timeline. */
  @Get('days')
  async getDays(
    @CurrentUser() user: AuthenticatedUser,
    @Query() range: DateRangeQuery,
  ): Promise<CollectionEnvelope<RecoveryDayResponse>> {
    return this.queryBus.execute(
      new GetRecoveryRangeQuery(
        user.userId,
        range.from,
        range.to,
        range.cursor ?? null,
        DEFAULT_PAGE_LIMIT,
      ),
    );
  }
}
