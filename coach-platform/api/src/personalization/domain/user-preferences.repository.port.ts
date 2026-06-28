import { EventDiscipline } from './preference-event.model';
import { UserPreferences } from './user-preferences.model';

/** DI token for the user-preferences projection repository (DIP). */
export const USER_PREFERENCES_REPOSITORY = Symbol('USER_PREFERENCES_REPOSITORY');

/**
 * The projection store. Writes are full per-(user,discipline) upserts produced
 * by a replay; reads serve the generation context slices.
 */
export interface UserPreferencesRepositoryPort {
  /** The projection for one discipline, or null if never built. */
  findByDiscipline(
    userId: string,
    discipline: EventDiscipline,
  ): Promise<UserPreferences | null>;

  /** Both disciplines' projections for a user. */
  findAll(userId: string): Promise<UserPreferences[]>;

  /** Replace (or create) the projection for its (user, discipline). */
  upsert(prefs: UserPreferences): Promise<void>;
}
