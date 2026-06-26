import { Program } from './program.model';

/** DI token for the program repository port (DIP). */
export const PROGRAM_REPOSITORY = Symbol('PROGRAM_REPOSITORY');

/**
 * Domain-facing persistence contract. Tenant-scoped by userId. Keeps a single
 * 'active' program per user; prior ones are archived as 'completed'/'abandoned'
 * so program history is preserved without a future migration.
 */
export interface ProgramRepositoryPort {
  /** The caller's current active program, or null if none exists yet. */
  findActive(userId: string): Promise<Program | null>;

  /** Fetch a specific program owned by the caller. */
  findById(userId: string, programId: string): Promise<Program | null>;

  /**
   * Archives any existing active program (status -> 'completed') and inserts the
   * given one as the new active program. Atomic when run inside a transaction.
   * Returns the new program's id.
   */
  replaceActive(program: Program): Promise<string>;

  /** Replace the `weeks[]` skeleton (e.g. after promoting/regenerating a week). */
  updateWeeks(
    userId: string,
    programId: string,
    weeks: Program['weeks'],
    currentWeekIndex: number,
  ): Promise<void>;
}
