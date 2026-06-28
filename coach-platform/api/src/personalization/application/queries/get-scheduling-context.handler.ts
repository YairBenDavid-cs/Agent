import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { SchedulingContext } from '../../domain/generation-context.model';
import { ContextBuilderService } from '../services/context-builder.service';
import { GetSchedulingContextQuery } from './get-scheduling-context.query';

@QueryHandler(GetSchedulingContextQuery)
export class GetSchedulingContextHandler
  implements IQueryHandler<GetSchedulingContextQuery, SchedulingContext>
{
  constructor(private readonly builder: ContextBuilderService) {}

  async execute(query: GetSchedulingContextQuery): Promise<SchedulingContext> {
    return this.builder.buildSchedulingContext(query.userId);
  }
}
