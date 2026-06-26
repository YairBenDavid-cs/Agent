import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../domain/program.repository.port';
import { ActiveProgramResponse } from '../dto/program.response';
import { toProgramResponse } from '../program.mapper';
import { GetActiveProgramQuery } from './get-active-program.query';

@QueryHandler(GetActiveProgramQuery)
export class GetActiveProgramHandler
  implements IQueryHandler<GetActiveProgramQuery, ActiveProgramResponse>
{
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repository: ProgramRepositoryPort,
  ) {}

  async execute(
    query: GetActiveProgramQuery,
  ): Promise<ActiveProgramResponse> {
    const program = await this.repository.findActive(query.userId);
    return {
      hasProgram: program != null,
      program: program ? toProgramResponse(program) : null,
    };
  }
}
