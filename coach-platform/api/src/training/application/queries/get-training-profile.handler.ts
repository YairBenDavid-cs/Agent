import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  TRAINING_PROFILE_REPOSITORY,
  TrainingProfileRepositoryPort,
} from '../../domain/training-profile.repository.port';
import { TrainingProfileStatusResponse } from '../dto/training-profile.response';
import { toTrainingProfileResponse } from '../training-profile.mapper';
import { GetTrainingProfileQuery } from './get-training-profile.query';

@QueryHandler(GetTrainingProfileQuery)
export class GetTrainingProfileHandler
  implements
    IQueryHandler<GetTrainingProfileQuery, TrainingProfileStatusResponse>
{
  constructor(
    @Inject(TRAINING_PROFILE_REPOSITORY)
    private readonly repository: TrainingProfileRepositoryPort,
  ) {}

  async execute(
    query: GetTrainingProfileQuery,
  ): Promise<TrainingProfileStatusResponse> {
    const profile = await this.repository.findActive(query.userId);
    return {
      onboarded: profile != null,
      profile: profile ? toTrainingProfileResponse(profile) : null,
    };
  }
}
