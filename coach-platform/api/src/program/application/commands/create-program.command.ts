import { CreateProgramDto } from '../dto/create-program.dto';

/** Seed a new active program for the authenticated user. */
export class CreateProgramCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: CreateProgramDto,
  ) {}
}

export interface CreateProgramResult {
  programId: string;
}
