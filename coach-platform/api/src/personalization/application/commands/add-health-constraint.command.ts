import { AddHealthConstraintDto } from '../dto/add-health-constraint.dto';

/**
 * Record an injury / limitation (N=1, never decays). Expands the human-described
 * injury into canonical avoid-ids before persisting.
 */
export class AddHealthConstraintCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: AddHealthConstraintDto,
  ) {}
}
