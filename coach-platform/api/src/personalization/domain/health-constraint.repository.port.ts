import { HealthConstraint } from './health-constraint.model';

/** DI token for the health-constraint repository port (DIP). */
export const HEALTH_CONSTRAINT_REPOSITORY = Symbol(
  'HEALTH_CONSTRAINT_REPOSITORY',
);

export interface HealthConstraintRepositoryPort {
  /** Insert a new constraint. Returns the store-assigned id. */
  add(constraint: HealthConstraint): Promise<string>;

  /** All active constraints for a user (the generator's hard exclusion set). */
  findActive(userId: string): Promise<HealthConstraint[]>;

  /** Every constraint, active or resolved. */
  findAll(userId: string): Promise<HealthConstraint[]>;

  findById(userId: string, constraintId: string): Promise<HealthConstraint | null>;

  /** Mark a constraint resolved (recovery) — never hard-deleted, for history. */
  resolve(userId: string, constraintId: string, resolvedAt: string): Promise<void>;
}
