import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { RecoveryContext } from '../../domain/generation-context.model';
import { ContextBuilderService } from '../services/context-builder.service';
import { GetRecoveryContextQuery } from './get-recovery-context.query';

@QueryHandler(GetRecoveryContextQuery)
export class GetRecoveryContextHandler
  implements IQueryHandler<GetRecoveryContextQuery, RecoveryContext>
{
  constructor(private readonly builder: ContextBuilderService) {}

  async execute(query: GetRecoveryContextQuery): Promise<RecoveryContext> {
    return this.builder.buildRecoveryContext(query.userId);
  }
}
