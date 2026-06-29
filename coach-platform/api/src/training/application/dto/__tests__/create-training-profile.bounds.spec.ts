import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTrainingProfileDto } from '../create-training-profile.dto';

/**
 * Onboarding numeric/text inputs must be bounded server-side: the bounded
 * frontend widgets are a UX nicety, not a trust boundary. An out-of-range value
 * (manual API call, replayed payload) must be rejected by the global
 * ValidationPipe before it reaches a Mongo write or the program generator.
 */
describe('CreateTrainingProfileDto bounds', () => {
  const baseProfile = {
    sex: 'male',
    dateOfBirth: '1990-01-01',
    country: 'GB',
    timezone: 'Europe/London',
  };
  const baseGoal = { primaryGoal: 'build_endurance' };
  const availability = [{ day: 'mon', startTime: '06:00', endTime: '07:00' }];

  function runProfile(run: Record<string, unknown>): CreateTrainingProfileDto {
    return plainToInstance(CreateTrainingProfileDto, {
      discipline: 'running',
      goal: baseGoal,
      profile: baseProfile,
      availability,
      sessionDurationMin: 60,
      run,
    });
  }

  function strengthProfile(
    strength: Record<string, unknown>,
  ): CreateTrainingProfileDto {
    return plainToInstance(CreateTrainingProfileDto, {
      discipline: 'strength',
      goal: baseGoal,
      profile: baseProfile,
      availability,
      sessionDurationMin: 60,
      strength,
    });
  }

  async function failingPaths(dto: CreateTrainingProfileDto): Promise<string[]> {
    const errors = await validate(dto, { whitelist: true });
    const paths: string[] = [];
    const walk = (e: import('class-validator').ValidationError, prefix: string) => {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) paths.push(path);
      e.children?.forEach((c) => walk(c, path));
    };
    errors.forEach((e) => walk(e, ''));
    return paths;
  }

  const validRun = {
    weeklyKm: 40,
    likedRunTypes: ['easy', 'long'],
    longestRecentKm: 21,
    targetRace: '10k road race',
    recent5kTime: '24:30',
  };

  const validStrength = {
    targetMuscleGroups: ['chest', 'back'],
    exercisesPerSession: 6,
    setsPerExercise: 4,
    repsPerExercise: 10,
    equipment: ['dumbbells'],
    preferredExercises: ['bench press', 'row'],
  };

  it('accepts in-range running prefs', async () => {
    expect(await failingPaths(runProfile(validRun))).toEqual([]);
  });

  it('rejects weeklyKm above the cap', async () => {
    const paths = await failingPaths(runProfile({ ...validRun, weeklyKm: 5000 }));
    expect(paths).toContain('run.weeklyKm');
  });

  it('rejects longestRecentKm above the cap', async () => {
    const paths = await failingPaths(
      runProfile({ ...validRun, longestRecentKm: 9999 }),
    );
    expect(paths).toContain('run.longestRecentKm');
  });

  it('rejects an over-long targetRace string', async () => {
    const paths = await failingPaths(
      runProfile({ ...validRun, targetRace: 'x'.repeat(200) }),
    );
    expect(paths).toContain('run.targetRace');
  });

  it('rejects a malformed recent5kTime', async () => {
    const paths = await failingPaths(
      runProfile({ ...validRun, recent5kTime: 'twenty minutes' }),
    );
    expect(paths).toContain('run.recent5kTime');
  });

  it('accepts a well-formed recent5kTime', async () => {
    expect(
      await failingPaths(runProfile({ ...validRun, recent5kTime: '1:02:30' })),
    ).toEqual([]);
  });

  it('accepts in-range strength prefs', async () => {
    expect(await failingPaths(strengthProfile(validStrength))).toEqual([]);
  });

  it('rejects exercisesPerSession / setsPerExercise / repsPerExercise above caps', async () => {
    const paths = await failingPaths(
      strengthProfile({
        ...validStrength,
        exercisesPerSession: 999,
        setsPerExercise: 999,
        repsPerExercise: 999,
      }),
    );
    expect(paths).toContain('strength.exercisesPerSession');
    expect(paths).toContain('strength.setsPerExercise');
    expect(paths).toContain('strength.repsPerExercise');
  });

  it('rejects too many preferredExercises', async () => {
    const paths = await failingPaths(
      strengthProfile({
        ...validStrength,
        preferredExercises: Array.from({ length: 60 }, (_, i) => `ex${i}`),
      }),
    );
    expect(paths).toContain('strength.preferredExercises');
  });

  it('rejects an over-long preferredExercises entry', async () => {
    const paths = await failingPaths(
      strengthProfile({
        ...validStrength,
        preferredExercises: ['x'.repeat(200)],
      }),
    );
    expect(paths).toContain('strength.preferredExercises');
  });
});
