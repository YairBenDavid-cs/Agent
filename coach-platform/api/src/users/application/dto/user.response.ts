import { Sex, Units, UserProfile } from '../../domain/user.model';

export class UserResponse {
  id!: string;
  email!: string;
  name!: string;
  dateOfBirth!: string | null;
  sex!: Sex | null;
  country!: string | null;
  timezone!: string | null;
  locale!: string;
  units!: Units;
  heightCm!: number | null;
  weightKg!: number | null;
  autoModeOptIn!: boolean;
}

export const toUserResponse = (p: UserProfile): UserResponse => ({
  id: p.userId,
  email: p.email,
  name: p.name,
  dateOfBirth: p.dateOfBirth,
  sex: p.sex,
  country: p.country,
  timezone: p.timezone,
  locale: p.locale,
  units: p.units,
  heightCm: p.heightCm,
  weightKg: p.weightKg,
  autoModeOptIn: p.autoModeOptIn,
});
