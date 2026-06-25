import {
  RunningDetail,
  SessionType,
  StrengthDetail,
} from '../../domain/workout-session.model';

export class SessionResponse {
  activityId!: number;
  date!: string;
  type!: SessionType;
  subtype!: string | null;
  source!: string;
  running!: RunningDetail | null;
  strength!: StrengthDetail | null;
}
