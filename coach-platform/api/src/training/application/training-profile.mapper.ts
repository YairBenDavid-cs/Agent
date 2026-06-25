import { TrainingProfile } from '../domain/training-profile.model';
import { TrainingProfileResponse } from './dto/training-profile.response';

export const toTrainingProfileResponse = (
  profile: TrainingProfile,
): TrainingProfileResponse => ({
  discipline: profile.discipline,
  goal: profile.goal,
  availability: profile.availability,
  sessionDurationMin: profile.sessionDurationMin,
  run: profile.run,
  strength: profile.strength,
  status: profile.status,
  completedAt: profile.completedAt,
});
