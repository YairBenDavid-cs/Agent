import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { AutoModeRun } from '../../domain/auto-mode-run.model';
import {
  AUTO_MODE_RUN_REPOSITORY,
  AutoModeRunRepositoryPort,
} from '../../domain/auto-mode-run.repository.port';
import { ListAutoModeRunsQuery } from './list-auto-mode-runs.query';

@QueryHandler(ListAutoModeRunsQuery)
export class ListAutoModeRunsHandler
  implements IQueryHandler<ListAutoModeRunsQuery, AutoModeRun[]>
{
  constructor(
    @Inject(AUTO_MODE_RUN_REPOSITORY)
    private readonly runs: AutoModeRunRepositoryPort,
  ) {}

  execute(query: ListAutoModeRunsQuery): Promise<AutoModeRun[]> {
    return this.runs.findRecent(query.userId, query.limit);
  }
}
