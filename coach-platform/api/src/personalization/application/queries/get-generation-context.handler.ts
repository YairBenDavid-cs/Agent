import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GenerationContext } from '../../domain/generation-context.model';
import { ContextBuilderService } from '../services/context-builder.service';
import { GetGenerationContextQuery } from './get-generation-context.query';

@QueryHandler(GetGenerationContextQuery)
export class GetGenerationContextHandler
  implements IQueryHandler<GetGenerationContextQuery, GenerationContext>
{
  constructor(private readonly builder: ContextBuilderService) {}

  async execute(query: GetGenerationContextQuery): Promise<GenerationContext> {
    return this.builder.buildGenerationContext(query.userId, query.discipline);
  }
}
