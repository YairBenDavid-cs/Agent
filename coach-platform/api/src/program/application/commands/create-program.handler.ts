import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionManager } from '../../../common/transaction/transaction.manager';
import { Program } from '../../domain/program.model';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../domain/program.repository.port';
import { CreateProgramDto } from '../dto/create-program.dto';
import {
  CreateProgramCommand,
  CreateProgramResult,
} from './create-program.command';

/**
 * Seeds a new active program, archiving any prior active one in the same
 * transaction so the partial-unique index never trips. No generation logic
 * lives here — the program skeleton arrives fully-formed in the DTO.
 */
@CommandHandler(CreateProgramCommand)
export class CreateProgramHandler
  implements ICommandHandler<CreateProgramCommand, CreateProgramResult>
{
  constructor(
    private readonly txn: TransactionManager,
    @Inject(PROGRAM_REPOSITORY)
    private readonly repository: ProgramRepositoryPort,
  ) {}

  async execute(command: CreateProgramCommand): Promise<CreateProgramResult> {
    const program = this.toDomain(command.userId, command.dto);

    let programId = '';
    await this.txn.runInTransaction(async () => {
      programId = await this.repository.replaceActive(program);
    });

    return { programId };
  }

  private toDomain(userId: string, dto: CreateProgramDto): Program {
    return {
      id: null,
      userId,
      trainingProfileId: dto.trainingProfileId ?? null,
      discipline: dto.discipline,
      goalSnapshot: {
        primaryGoal: dto.goalSnapshot.primaryGoal,
        note: dto.goalSnapshot.note ?? null,
        horizon: dto.goalSnapshot.horizon,
      },
      startDate: dto.startDate,
      horizonDate: dto.horizonDate,
      status: 'active',
      currentWeekIndex: 0,
      weeks: dto.weeks.map((w) => ({
        weekIndex: w.weekIndex,
        startDate: w.startDate,
        endDate: w.endDate,
        theme: w.theme,
        plannedLoadTarget: w.plannedLoadTarget ?? null,
        planState: w.planState,
        status: w.status,
        generatedAt: null,
      })),
    };
  }
}
