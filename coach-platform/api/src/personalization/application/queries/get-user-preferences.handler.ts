import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UserPreferences } from '../../domain/user-preferences.model';
import {
  USER_PREFERENCES_REPOSITORY,
  UserPreferencesRepositoryPort,
} from '../../domain/user-preferences.repository.port';
import { GetUserPreferencesQuery } from './get-user-preferences.query';

@QueryHandler(GetUserPreferencesQuery)
export class GetUserPreferencesHandler
  implements IQueryHandler<GetUserPreferencesQuery, UserPreferences | null>
{
  constructor(
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly repository: UserPreferencesRepositoryPort,
  ) {}

  async execute(
    query: GetUserPreferencesQuery,
  ): Promise<UserPreferences | null> {
    return this.repository.findByDiscipline(query.userId, query.discipline);
  }
}
