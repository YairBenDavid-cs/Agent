import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { PlannedSessionsModule } from '../planned-sessions/planned-sessions.module';
import { AdvanceCurrentWeekHandler } from './application/commands/advance-current-week.handler';
import { CommitSkeletonHandler } from './application/commands/commit-skeleton.handler';
import { CreateProgramHandler } from './application/commands/create-program.handler';
import { LockWeeklyTargetsHandler } from './application/commands/lock-weekly-targets.handler';
import { ProposeWeeklyTargetsHandler } from './application/commands/propose-weekly-targets.handler';
import { ReviseWeeklyTargetsHandler } from './application/commands/revise-weekly-targets.handler';
import { GetActiveProgramHandler } from './application/queries/get-active-program.handler';
import { PROGRAM_REPOSITORY } from './domain/program.repository.port';
import { ProgramRepository } from './infrastructure/program.repository';
import { ProgramDoc, ProgramSchema } from './infrastructure/program.schema';
import { ProgramController } from './interface/program.controller';

const CommandHandlers = [
  CreateProgramHandler,
  CommitSkeletonHandler,
  AdvanceCurrentWeekHandler,
  LockWeeklyTargetsHandler,
  ProposeWeeklyTargetsHandler,
  ReviseWeeklyTargetsHandler,
];
const QueryHandlers = [GetActiveProgramHandler];

@Module({
  imports: [
    CqrsModule,
    MongooseModule.forFeature([
      { name: ProgramDoc.name, schema: ProgramSchema },
    ]),
    PlannedSessionsModule,
  ],
  controllers: [ProgramController],
  providers: [
    { provide: PROGRAM_REPOSITORY, useClass: ProgramRepository },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [PROGRAM_REPOSITORY],
})
export class ProgramModule {}
