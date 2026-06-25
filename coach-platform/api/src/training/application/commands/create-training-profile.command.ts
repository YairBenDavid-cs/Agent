import { CreateTrainingProfileDto } from '../dto/create-training-profile.dto';

/** Submit the completed onboarding wizard for the authenticated user. */
export class CreateTrainingProfileCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: CreateTrainingProfileDto,
  ) {}
}
