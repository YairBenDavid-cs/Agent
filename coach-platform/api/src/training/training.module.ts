import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { CreateTrainingProfileHandler } from './application/commands/create-training-profile.handler';
import { GetTrainingProfileHandler } from './application/queries/get-training-profile.handler';
import { TRAINING_PROFILE_REPOSITORY } from './domain/training-profile.repository.port';
import { TrainingProfileRepository } from './infrastructure/training-profile.repository';
import {
  TrainingProfile,
  TrainingProfileSchema,
} from './infrastructure/training-profile.schema';
import { TrainingController } from './interface/training.controller';

const CommandHandlers = [CreateTrainingProfileHandler];
const QueryHandlers = [GetTrainingProfileHandler];

@Module({
  imports: [
    CqrsModule,
    // UsersModule registers UpdateUserProfileHandler on the command bus, which
    // the onboarding submit dispatches to patch the `users` record.
    UsersModule,
    MongooseModule.forFeature([
      { name: TrainingProfile.name, schema: TrainingProfileSchema },
    ]),
  ],
  controllers: [TrainingController],
  providers: [
    {
      provide: TRAINING_PROFILE_REPOSITORY,
      useClass: TrainingProfileRepository,
    },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class TrainingModule {}
