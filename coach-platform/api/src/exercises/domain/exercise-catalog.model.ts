/**
 * Canonical exercise catalog — the single source of truth for exercise identity.
 * Framework-free: no Nest, no Mongoose, no class-validator.
 *
 * Why this exists:
 *   `planned_sessions.strength.exercises[].name`, `sessions` aggregates, and
 *   `training_profiles.strength.preferredExercises` are all FREE TEXT
 *   ("bench press" vs "Barbell Bench Press" vs "DB bench"). The personalization
 *   projection keys `avoidExercises` and `perExerciseOverrides` by exercise, so
 *   we need ONE stable key per movement. That key is `CatalogExercise.id`.
 *
 *   `aliases` is the resolver surface: any free-text mention is normalized and
 *   matched against id/name/aliases to recover the canonical id. New variants
 *   only need to be added to `aliases` — never re-key the projection.
 *
 * Invariants:
 *   - `id` is globally unique, stable, snake_case. Never reuse or rename.
 *   - `primaryMuscle` / `secondaryMuscles` use the shared MuscleGroup vocabulary.
 *   - `equipment` uses the shared Equipment vocabulary (so the projection's
 *     `equipment` constraint can filter the catalog directly).
 *   - `category` uses the controlled ExerciseCategory vocabulary below — this is
 *     the match point between planned prescriptions and observed sessions.
 */

import type { Equipment, MuscleGroup, ExperienceLevel } from '../../training/domain/training-profile.model';

/** Difficulty reuses the experience-level scale. */
export type ExerciseDifficulty = ExperienceLevel; // 'beginner' | 'intermediate' | 'advanced'

/** Biomechanical movement pattern — useful for swaps and balanced programming. */
export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'core'
  | 'isolation'
  | 'olympic'
  | 'plyometric';

/**
 * Controlled category vocabulary. This is the plan-vs-actual match key
 * (replaces the current free-text `category` on planned/observed exercises).
 */
export type ExerciseCategory =
  | 'horizontal_press'
  | 'incline_press'
  | 'chest_fly'
  | 'vertical_press'
  | 'lateral_raise'
  | 'rear_delt'
  | 'front_raise'
  | 'upright_row'
  | 'vertical_pull'
  | 'horizontal_row'
  | 'pullover'
  | 'shrug'
  | 'biceps_curl'
  | 'triceps_extension'
  | 'squat'
  | 'hip_hinge'
  | 'lunge'
  | 'leg_press'
  | 'leg_extension'
  | 'leg_curl'
  | 'calf_raise'
  | 'hip_thrust'
  | 'core_anti_extension'
  | 'core_flexion'
  | 'core_rotation'
  | 'olympic'
  | 'conditioning'
  | 'carry';

export interface CatalogExercise {
  /** Stable canonical key. The projection references this, never the free text. */
  id: string;
  /** Human-readable canonical display name. */
  name: string;
  /** Free-text variants that resolve to this exercise (lowercase recommended). */
  aliases: string[];
  category: ExerciseCategory;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  /** All equipment options that can perform this movement. */
  equipment: Equipment[];
  movementPattern: MovementPattern;
  isCompound: boolean;
  isUnilateral: boolean;
  difficulty: ExerciseDifficulty;
}

/**
 * THE CATALOG.
 * Grouped by primary muscle for readability; order is not significant.
 */
export const EXERCISE_CATALOG: CatalogExercise[] = [
  // ============================ CHEST ============================
  {
    id: 'barbell_bench_press', name: 'Barbell Bench Press',
    aliases: ['bench press', 'bench', 'bb bench', 'flat bench', 'flat barbell press'],
    category: 'horizontal_press', primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'],
    equipment: ['barbell'], movementPattern: 'horizontal_push', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'incline_barbell_bench_press', name: 'Incline Barbell Bench Press',
    aliases: ['incline bench', 'incline barbell press', 'incline bench press'],
    category: 'incline_press', primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'],
    equipment: ['barbell'], movementPattern: 'horizontal_push', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'decline_barbell_bench_press', name: 'Decline Barbell Bench Press',
    aliases: ['decline bench', 'decline press'],
    category: 'horizontal_press', primaryMuscle: 'chest', secondaryMuscles: ['arms'],
    equipment: ['barbell'], movementPattern: 'horizontal_push', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'dumbbell_bench_press', name: 'Dumbbell Bench Press',
    aliases: ['db bench', 'dumbbell press', 'flat dumbbell press', 'db chest press'],
    category: 'horizontal_press', primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'],
    equipment: ['dumbbells'], movementPattern: 'horizontal_push', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'incline_dumbbell_press', name: 'Incline Dumbbell Press',
    aliases: ['incline db press', 'incline dumbbell bench'],
    category: 'incline_press', primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'],
    equipment: ['dumbbells'], movementPattern: 'horizontal_push', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'machine_chest_press', name: 'Machine Chest Press',
    aliases: ['chest press machine', 'seated chest press'],
    category: 'horizontal_press', primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'],
    equipment: ['machines'], movementPattern: 'horizontal_push', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'dumbbell_fly', name: 'Dumbbell Fly',
    aliases: ['db fly', 'chest fly', 'flat fly', 'dumbbell flye'],
    category: 'chest_fly', primaryMuscle: 'chest', secondaryMuscles: ['shoulders'],
    equipment: ['dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'cable_crossover', name: 'Cable Crossover',
    aliases: ['cable fly', 'crossover', 'cable chest fly'],
    category: 'chest_fly', primaryMuscle: 'chest', secondaryMuscles: ['shoulders'],
    equipment: ['cables'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'pec_deck', name: 'Pec Deck Machine',
    aliases: ['pec deck', 'butterfly machine', 'machine fly'],
    category: 'chest_fly', primaryMuscle: 'chest', secondaryMuscles: ['shoulders'],
    equipment: ['machines'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'push_up', name: 'Push-Up',
    aliases: ['pushup', 'push ups', 'press up'],
    category: 'horizontal_press', primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms', 'core'],
    equipment: ['bodyweight'], movementPattern: 'horizontal_push', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'chest_dip', name: 'Chest Dip',
    aliases: ['dips', 'chest dips', 'parallel bar dip'],
    category: 'horizontal_press', primaryMuscle: 'chest', secondaryMuscles: ['arms', 'shoulders'],
    equipment: ['bodyweight'], movementPattern: 'vertical_push', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },

  // ============================ BACK ============================
  {
    id: 'conventional_deadlift', name: 'Conventional Deadlift',
    aliases: ['deadlift', 'deadlifts', 'conventional dl', 'barbell deadlift'],
    category: 'hip_hinge', primaryMuscle: 'back', secondaryMuscles: ['legs', 'glutes', 'core'],
    equipment: ['barbell'], movementPattern: 'hinge', isCompound: true, isUnilateral: false, difficulty: 'advanced',
  },
  {
    id: 'trap_bar_deadlift', name: 'Trap Bar Deadlift',
    aliases: ['hex bar deadlift', 'trap bar dl'],
    category: 'hip_hinge', primaryMuscle: 'back', secondaryMuscles: ['legs', 'glutes'],
    equipment: ['barbell'], movementPattern: 'hinge', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'rack_pull', name: 'Rack Pull',
    aliases: ['rack pulls', 'partial deadlift'],
    category: 'hip_hinge', primaryMuscle: 'back', secondaryMuscles: ['glutes'],
    equipment: ['barbell'], movementPattern: 'hinge', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'pull_up', name: 'Pull-Up',
    aliases: ['pullup', 'pull ups', 'pronated pull up'],
    category: 'vertical_pull', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['bodyweight', 'pullup_bar'], movementPattern: 'vertical_pull', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'chin_up', name: 'Chin-Up',
    aliases: ['chinup', 'chin ups', 'supinated pull up'],
    category: 'vertical_pull', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['bodyweight', 'pullup_bar'], movementPattern: 'vertical_pull', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'lat_pulldown', name: 'Lat Pulldown',
    aliases: ['pulldown', 'lat pull down', 'cable pulldown'],
    category: 'vertical_pull', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['cables', 'machines'], movementPattern: 'vertical_pull', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'bent_over_barbell_row', name: 'Bent-Over Barbell Row',
    aliases: ['barbell row', 'bent over row', 'bb row', 'bent-over row'],
    category: 'horizontal_row', primaryMuscle: 'back', secondaryMuscles: ['arms', 'shoulders'],
    equipment: ['barbell'], movementPattern: 'horizontal_pull', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'pendlay_row', name: 'Pendlay Row',
    aliases: ['pendlay', 'dead-stop row'],
    category: 'horizontal_row', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['barbell'], movementPattern: 'horizontal_pull', isCompound: true, isUnilateral: false, difficulty: 'advanced',
  },
  {
    id: 'dumbbell_row', name: 'Dumbbell Row',
    aliases: ['db row', 'single arm row', 'one arm dumbbell row', 'one-arm row'],
    category: 'horizontal_row', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['dumbbells'], movementPattern: 'horizontal_pull', isCompound: true, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'seated_cable_row', name: 'Seated Cable Row',
    aliases: ['cable row', 'seated row', 'low row'],
    category: 'horizontal_row', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['cables'], movementPattern: 'horizontal_pull', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 't_bar_row', name: 'T-Bar Row',
    aliases: ['t bar row', 'tbar row', 'landmine row'],
    category: 'horizontal_row', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['barbell', 'machines'], movementPattern: 'horizontal_pull', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'machine_row', name: 'Machine Row',
    aliases: ['seated machine row', 'hammer strength row', 'chest supported row'],
    category: 'horizontal_row', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['machines'], movementPattern: 'horizontal_pull', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'inverted_row', name: 'Inverted Row',
    aliases: ['bodyweight row', 'australian pull up'],
    category: 'horizontal_row', primaryMuscle: 'back', secondaryMuscles: ['arms'],
    equipment: ['bodyweight'], movementPattern: 'horizontal_pull', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'face_pull', name: 'Face Pull',
    aliases: ['face pulls', 'cable face pull'],
    category: 'rear_delt', primaryMuscle: 'shoulders', secondaryMuscles: ['back'],
    equipment: ['cables'], movementPattern: 'horizontal_pull', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'straight_arm_pulldown', name: 'Straight-Arm Pulldown',
    aliases: ['straight arm pulldown', 'pullover cable'],
    category: 'pullover', primaryMuscle: 'back', secondaryMuscles: ['chest'],
    equipment: ['cables'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'barbell_shrug', name: 'Barbell Shrug',
    aliases: ['shrug', 'shrugs', 'trap shrug'],
    category: 'shrug', primaryMuscle: 'back', secondaryMuscles: ['shoulders'],
    equipment: ['barbell', 'dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },

  // ============================ SHOULDERS ============================
  {
    id: 'overhead_press', name: 'Overhead Press',
    aliases: ['ohp', 'military press', 'barbell shoulder press', 'standing press', 'strict press'],
    category: 'vertical_press', primaryMuscle: 'shoulders', secondaryMuscles: ['arms', 'core'],
    equipment: ['barbell'], movementPattern: 'vertical_push', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'seated_dumbbell_shoulder_press', name: 'Seated Dumbbell Shoulder Press',
    aliases: ['db shoulder press', 'dumbbell overhead press', 'seated db press'],
    category: 'vertical_press', primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],
    equipment: ['dumbbells'], movementPattern: 'vertical_push', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'arnold_press', name: 'Arnold Press',
    aliases: ['arnold', 'arnold dumbbell press'],
    category: 'vertical_press', primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],
    equipment: ['dumbbells'], movementPattern: 'vertical_push', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'machine_shoulder_press', name: 'Machine Shoulder Press',
    aliases: ['shoulder press machine', 'seated machine press'],
    category: 'vertical_press', primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],
    equipment: ['machines'], movementPattern: 'vertical_push', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'dumbbell_lateral_raise', name: 'Dumbbell Lateral Raise',
    aliases: ['lateral raise', 'lat raise', 'side raise', 'side lateral'],
    category: 'lateral_raise', primaryMuscle: 'shoulders', secondaryMuscles: [],
    equipment: ['dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'cable_lateral_raise', name: 'Cable Lateral Raise',
    aliases: ['cable lat raise', 'cable side raise'],
    category: 'lateral_raise', primaryMuscle: 'shoulders', secondaryMuscles: [],
    equipment: ['cables'], movementPattern: 'isolation', isCompound: false, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'front_raise', name: 'Front Raise',
    aliases: ['db front raise', 'dumbbell front raise'],
    category: 'front_raise', primaryMuscle: 'shoulders', secondaryMuscles: [],
    equipment: ['dumbbells', 'cables', 'barbell'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'reverse_pec_deck', name: 'Reverse Pec Deck',
    aliases: ['reverse fly machine', 'rear delt machine'],
    category: 'rear_delt', primaryMuscle: 'shoulders', secondaryMuscles: ['back'],
    equipment: ['machines'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'dumbbell_rear_delt_fly', name: 'Dumbbell Rear Delt Fly',
    aliases: ['rear delt fly', 'reverse fly', 'bent over lateral raise'],
    category: 'rear_delt', primaryMuscle: 'shoulders', secondaryMuscles: ['back'],
    equipment: ['dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'upright_row', name: 'Upright Row',
    aliases: ['upright rows', 'barbell upright row'],
    category: 'upright_row', primaryMuscle: 'shoulders', secondaryMuscles: ['back', 'arms'],
    equipment: ['barbell', 'dumbbells', 'cables'], movementPattern: 'vertical_pull', isCompound: false, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'pike_push_up', name: 'Pike Push-Up',
    aliases: ['pike pushup', 'pike press'],
    category: 'vertical_press', primaryMuscle: 'shoulders', secondaryMuscles: ['arms', 'chest'],
    equipment: ['bodyweight'], movementPattern: 'vertical_push', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },

  // ============================ ARMS ============================
  {
    id: 'barbell_curl', name: 'Barbell Curl',
    aliases: ['bb curl', 'bicep curl', 'biceps curl', 'standing barbell curl'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['barbell'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'ez_bar_curl', name: 'EZ-Bar Curl',
    aliases: ['ez bar curl', 'ez curl', 'preacher ez curl'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['barbell'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'dumbbell_curl', name: 'Dumbbell Curl',
    aliases: ['db curl', 'dumbbell bicep curl', 'standing dumbbell curl'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'hammer_curl', name: 'Hammer Curl',
    aliases: ['hammer curls', 'neutral grip curl'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'preacher_curl', name: 'Preacher Curl',
    aliases: ['preacher curls', 'preacher bench curl'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['barbell', 'dumbbells', 'machines'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'incline_dumbbell_curl', name: 'Incline Dumbbell Curl',
    aliases: ['incline curl', 'incline db curl'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'cable_curl', name: 'Cable Curl',
    aliases: ['cable bicep curl', 'cable biceps curl'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['cables'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'concentration_curl', name: 'Concentration Curl',
    aliases: ['concentration curls'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'close_grip_bench_press', name: 'Close-Grip Bench Press',
    aliases: ['close grip bench', 'cgbp', 'close-grip press'],
    category: 'triceps_extension', primaryMuscle: 'arms', secondaryMuscles: ['chest', 'shoulders'],
    equipment: ['barbell'], movementPattern: 'horizontal_push', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'triceps_pushdown', name: 'Triceps Pushdown',
    aliases: ['tricep pushdown', 'cable pushdown', 'rope pushdown', 'tricep pressdown'],
    category: 'triceps_extension', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['cables'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'overhead_triceps_extension', name: 'Overhead Triceps Extension',
    aliases: ['overhead tricep extension', 'french press', 'overhead extension'],
    category: 'triceps_extension', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['dumbbells', 'cables', 'barbell'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'skull_crusher', name: 'Skull Crusher',
    aliases: ['skullcrusher', 'lying triceps extension', 'lying tricep extension'],
    category: 'triceps_extension', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['barbell', 'dumbbells'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'triceps_dip', name: 'Triceps Dip',
    aliases: ['tricep dip', 'bench dip', 'parallel dip'],
    category: 'triceps_extension', primaryMuscle: 'arms', secondaryMuscles: ['chest', 'shoulders'],
    equipment: ['bodyweight'], movementPattern: 'vertical_push', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'triceps_kickback', name: 'Triceps Kickback',
    aliases: ['tricep kickback', 'db kickback', 'dumbbell kickback'],
    category: 'triceps_extension', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['dumbbells', 'cables'], movementPattern: 'isolation', isCompound: false, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'wrist_curl', name: 'Wrist Curl',
    aliases: ['forearm curl', 'wrist curls'],
    category: 'biceps_curl', primaryMuscle: 'arms', secondaryMuscles: [],
    equipment: ['dumbbells', 'barbell'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },

  // ============================ LEGS ============================
  {
    id: 'barbell_back_squat', name: 'Barbell Back Squat',
    aliases: ['back squat', 'squat', 'squats', 'bb squat', 'barbell squat'],
    category: 'squat', primaryMuscle: 'legs', secondaryMuscles: ['glutes', 'core'],
    equipment: ['barbell'], movementPattern: 'squat', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'front_squat', name: 'Front Squat',
    aliases: ['front squats', 'barbell front squat'],
    category: 'squat', primaryMuscle: 'legs', secondaryMuscles: ['glutes', 'core'],
    equipment: ['barbell'], movementPattern: 'squat', isCompound: true, isUnilateral: false, difficulty: 'advanced',
  },
  {
    id: 'goblet_squat', name: 'Goblet Squat',
    aliases: ['goblet squats', 'db goblet squat'],
    category: 'squat', primaryMuscle: 'legs', secondaryMuscles: ['glutes', 'core'],
    equipment: ['dumbbells', 'kettlebell'], movementPattern: 'squat', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'leg_press', name: 'Leg Press',
    aliases: ['leg press machine', '45 degree leg press'],
    category: 'leg_press', primaryMuscle: 'legs', secondaryMuscles: ['glutes'],
    equipment: ['machines'], movementPattern: 'squat', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'hack_squat', name: 'Hack Squat',
    aliases: ['hack squat machine', 'machine hack squat'],
    category: 'squat', primaryMuscle: 'legs', secondaryMuscles: ['glutes'],
    equipment: ['machines'], movementPattern: 'squat', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat',
    aliases: ['bss', 'rear foot elevated split squat', 'split squat'],
    category: 'lunge', primaryMuscle: 'legs', secondaryMuscles: ['glutes', 'core'],
    equipment: ['dumbbells', 'barbell', 'bodyweight'], movementPattern: 'lunge', isCompound: true, isUnilateral: true, difficulty: 'intermediate',
  },
  {
    id: 'walking_lunge', name: 'Walking Lunge',
    aliases: ['lunge', 'lunges', 'walking lunges', 'dumbbell lunge'],
    category: 'lunge', primaryMuscle: 'legs', secondaryMuscles: ['glutes', 'core'],
    equipment: ['dumbbells', 'barbell', 'bodyweight'], movementPattern: 'lunge', isCompound: true, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'step_up', name: 'Step-Up',
    aliases: ['step ups', 'box step up', 'dumbbell step up'],
    category: 'lunge', primaryMuscle: 'legs', secondaryMuscles: ['glutes'],
    equipment: ['dumbbells', 'bodyweight'], movementPattern: 'lunge', isCompound: true, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'romanian_deadlift', name: 'Romanian Deadlift',
    aliases: ['rdl', 'romanian dl', 'stiff leg deadlift', 'stiff-leg deadlift'],
    category: 'hip_hinge', primaryMuscle: 'legs', secondaryMuscles: ['glutes', 'back'],
    equipment: ['barbell', 'dumbbells'], movementPattern: 'hinge', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'leg_extension', name: 'Leg Extension',
    aliases: ['leg extensions', 'quad extension', 'knee extension'],
    category: 'leg_extension', primaryMuscle: 'legs', secondaryMuscles: [],
    equipment: ['machines'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'lying_leg_curl', name: 'Lying Leg Curl',
    aliases: ['leg curl', 'hamstring curl', 'lying hamstring curl'],
    category: 'leg_curl', primaryMuscle: 'legs', secondaryMuscles: [],
    equipment: ['machines'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'seated_leg_curl', name: 'Seated Leg Curl',
    aliases: ['seated hamstring curl', 'seated leg curls'],
    category: 'leg_curl', primaryMuscle: 'legs', secondaryMuscles: [],
    equipment: ['machines'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'standing_calf_raise', name: 'Standing Calf Raise',
    aliases: ['calf raise', 'calf raises', 'standing calf'],
    category: 'calf_raise', primaryMuscle: 'legs', secondaryMuscles: [],
    equipment: ['machines', 'dumbbells', 'barbell', 'bodyweight'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'seated_calf_raise', name: 'Seated Calf Raise',
    aliases: ['seated calf', 'seated calf raises'],
    category: 'calf_raise', primaryMuscle: 'legs', secondaryMuscles: [],
    equipment: ['machines'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'pistol_squat', name: 'Pistol Squat',
    aliases: ['pistol squats', 'single leg squat'],
    category: 'squat', primaryMuscle: 'legs', secondaryMuscles: ['glutes', 'core'],
    equipment: ['bodyweight'], movementPattern: 'squat', isCompound: true, isUnilateral: true, difficulty: 'advanced',
  },
  {
    id: 'wall_sit', name: 'Wall Sit',
    aliases: ['wall sits', 'wall squat'],
    category: 'squat', primaryMuscle: 'legs', secondaryMuscles: ['glutes'],
    equipment: ['bodyweight'], movementPattern: 'squat', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },

  // ============================ GLUTES ============================
  {
    id: 'barbell_hip_thrust', name: 'Barbell Hip Thrust',
    aliases: ['hip thrust', 'hip thrusts', 'glute thrust'],
    category: 'hip_thrust', primaryMuscle: 'glutes', secondaryMuscles: ['legs'],
    equipment: ['barbell'], movementPattern: 'hinge', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'glute_bridge', name: 'Glute Bridge',
    aliases: ['glute bridges', 'bridge', 'hip bridge'],
    category: 'hip_thrust', primaryMuscle: 'glutes', secondaryMuscles: ['legs'],
    equipment: ['bodyweight', 'barbell', 'dumbbells'], movementPattern: 'hinge', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'cable_glute_kickback', name: 'Cable Glute Kickback',
    aliases: ['glute kickback', 'cable kickback', 'donkey kick'],
    category: 'hip_thrust', primaryMuscle: 'glutes', secondaryMuscles: [],
    equipment: ['cables'], movementPattern: 'isolation', isCompound: false, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'sumo_deadlift', name: 'Sumo Deadlift',
    aliases: ['sumo dl', 'sumo deadlifts', 'wide stance deadlift'],
    category: 'hip_hinge', primaryMuscle: 'glutes', secondaryMuscles: ['legs', 'back'],
    equipment: ['barbell'], movementPattern: 'hinge', isCompound: true, isUnilateral: false, difficulty: 'advanced',
  },
  {
    id: 'good_morning', name: 'Good Morning',
    aliases: ['good mornings', 'barbell good morning'],
    category: 'hip_hinge', primaryMuscle: 'glutes', secondaryMuscles: ['legs', 'back'],
    equipment: ['barbell'], movementPattern: 'hinge', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'hip_abduction_machine', name: 'Hip Abduction Machine',
    aliases: ['abductor machine', 'hip abduction', 'glute abduction'],
    category: 'hip_thrust', primaryMuscle: 'glutes', secondaryMuscles: [],
    equipment: ['machines'], movementPattern: 'isolation', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },

  // ============================ CORE ============================
  {
    id: 'plank', name: 'Plank',
    aliases: ['planks', 'front plank', 'forearm plank'],
    category: 'core_anti_extension', primaryMuscle: 'core', secondaryMuscles: ['shoulders'],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'side_plank', name: 'Side Plank',
    aliases: ['side planks', 'lateral plank'],
    category: 'core_rotation', primaryMuscle: 'core', secondaryMuscles: ['shoulders'],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: false, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'hanging_leg_raise', name: 'Hanging Leg Raise',
    aliases: ['hanging leg raises', 'hanging knee raise', 'leg raise hang'],
    category: 'core_flexion', primaryMuscle: 'core', secondaryMuscles: [],
    equipment: ['bodyweight', 'pullup_bar'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'cable_crunch', name: 'Cable Crunch',
    aliases: ['cable crunches', 'kneeling cable crunch', 'rope crunch'],
    category: 'core_flexion', primaryMuscle: 'core', secondaryMuscles: [],
    equipment: ['cables'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'crunch', name: 'Crunch',
    aliases: ['crunches', 'ab crunch', 'floor crunch'],
    category: 'core_flexion', primaryMuscle: 'core', secondaryMuscles: [],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'lying_leg_raise', name: 'Lying Leg Raise',
    aliases: ['leg raise', 'leg raises', 'floor leg raise'],
    category: 'core_flexion', primaryMuscle: 'core', secondaryMuscles: [],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'russian_twist', name: 'Russian Twist',
    aliases: ['russian twists', 'seated twist'],
    category: 'core_rotation', primaryMuscle: 'core', secondaryMuscles: [],
    equipment: ['bodyweight', 'dumbbells', 'kettlebell'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'cable_woodchopper', name: 'Cable Woodchopper',
    aliases: ['woodchopper', 'wood chop', 'cable chop'],
    category: 'core_rotation', primaryMuscle: 'core', secondaryMuscles: ['shoulders'],
    equipment: ['cables'], movementPattern: 'core', isCompound: false, isUnilateral: true, difficulty: 'beginner',
  },
  {
    id: 'dead_bug', name: 'Dead Bug',
    aliases: ['dead bugs', 'deadbug'],
    category: 'core_anti_extension', primaryMuscle: 'core', secondaryMuscles: [],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'ab_wheel_rollout', name: 'Ab Wheel Rollout',
    aliases: ['ab wheel', 'ab rollout', 'rollout'],
    category: 'core_anti_extension', primaryMuscle: 'core', secondaryMuscles: ['shoulders'],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'advanced',
  },
  {
    id: 'bicycle_crunch', name: 'Bicycle Crunch',
    aliases: ['bicycle crunches', 'bicycles'],
    category: 'core_flexion', primaryMuscle: 'core', secondaryMuscles: [],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'hollow_hold', name: 'Hollow Hold',
    aliases: ['hollow body hold', 'hollow holds'],
    category: 'core_anti_extension', primaryMuscle: 'core', secondaryMuscles: [],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: false, isUnilateral: false, difficulty: 'intermediate',
  },

  // ===================== FULL BODY / OLYMPIC / CONDITIONING =====================
  {
    id: 'power_clean', name: 'Power Clean',
    aliases: ['power cleans', 'clean'],
    category: 'olympic', primaryMuscle: 'full_body', secondaryMuscles: ['legs', 'back', 'shoulders'],
    equipment: ['barbell'], movementPattern: 'olympic', isCompound: true, isUnilateral: false, difficulty: 'advanced',
  },
  {
    id: 'clean_and_jerk', name: 'Clean and Jerk',
    aliases: ['clean and jerk', 'c&j', 'clean & jerk'],
    category: 'olympic', primaryMuscle: 'full_body', secondaryMuscles: ['legs', 'shoulders', 'back'],
    equipment: ['barbell'], movementPattern: 'olympic', isCompound: true, isUnilateral: false, difficulty: 'advanced',
  },
  {
    id: 'snatch', name: 'Snatch',
    aliases: ['barbell snatch', 'power snatch'],
    category: 'olympic', primaryMuscle: 'full_body', secondaryMuscles: ['legs', 'shoulders', 'back'],
    equipment: ['barbell'], movementPattern: 'olympic', isCompound: true, isUnilateral: false, difficulty: 'advanced',
  },
  {
    id: 'kettlebell_swing', name: 'Kettlebell Swing',
    aliases: ['kb swing', 'kettlebell swings', 'russian swing'],
    category: 'conditioning', primaryMuscle: 'full_body', secondaryMuscles: ['glutes', 'legs', 'back'],
    equipment: ['kettlebell'], movementPattern: 'hinge', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'thruster', name: 'Thruster',
    aliases: ['thrusters', 'barbell thruster', 'squat to press'],
    category: 'conditioning', primaryMuscle: 'full_body', secondaryMuscles: ['legs', 'shoulders'],
    equipment: ['barbell', 'dumbbells', 'kettlebell'], movementPattern: 'olympic', isCompound: true, isUnilateral: false, difficulty: 'intermediate',
  },
  {
    id: 'burpee', name: 'Burpee',
    aliases: ['burpees'],
    category: 'conditioning', primaryMuscle: 'full_body', secondaryMuscles: ['legs', 'chest', 'core'],
    equipment: ['bodyweight'], movementPattern: 'plyometric', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'turkish_get_up', name: 'Turkish Get-Up',
    aliases: ['turkish getup', 'tgu', 'get up'],
    category: 'conditioning', primaryMuscle: 'full_body', secondaryMuscles: ['shoulders', 'core'],
    equipment: ['kettlebell', 'dumbbells'], movementPattern: 'core', isCompound: true, isUnilateral: true, difficulty: 'advanced',
  },
  {
    id: 'box_jump', name: 'Box Jump',
    aliases: ['box jumps', 'jump box'],
    category: 'conditioning', primaryMuscle: 'legs', secondaryMuscles: ['glutes'],
    equipment: ['bodyweight'], movementPattern: 'plyometric', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'wall_ball', name: 'Wall Ball',
    aliases: ['wall balls', 'medicine ball throw'],
    category: 'conditioning', primaryMuscle: 'full_body', secondaryMuscles: ['legs', 'shoulders'],
    equipment: ['bodyweight'], movementPattern: 'olympic', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'mountain_climber', name: 'Mountain Climber',
    aliases: ['mountain climbers'],
    category: 'conditioning', primaryMuscle: 'core', secondaryMuscles: ['legs', 'shoulders'],
    equipment: ['bodyweight'], movementPattern: 'core', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
  {
    id: 'farmers_carry', name: "Farmer's Carry",
    aliases: ['farmers carry', 'farmer carry', 'farmers walk', 'loaded carry'],
    category: 'carry', primaryMuscle: 'full_body', secondaryMuscles: ['core', 'back', 'arms'],
    equipment: ['dumbbells', 'kettlebell', 'barbell'], movementPattern: 'carry', isCompound: true, isUnilateral: false, difficulty: 'beginner',
  },
];

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/** Normalize free text for matching: lowercase, strip punctuation, collapse spaces. */
export function normalizeExerciseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lookup index built once: normalized id/name/alias -> canonical id. */
const RESOLUTION_INDEX: ReadonlyMap<string, string> = (() => {
  const index = new Map<string, string>();
  for (const ex of EXERCISE_CATALOG) {
    const keys = [ex.id.replace(/_/g, ' '), ex.name, ...ex.aliases];
    for (const key of keys) {
      index.set(normalizeExerciseName(key), ex.id);
    }
  }
  return index;
})();

const CATALOG_BY_ID: ReadonlyMap<string, CatalogExercise> = new Map(
  EXERCISE_CATALOG.map((ex) => [ex.id, ex]),
);

/** Resolve any free-text mention to a canonical exercise id, or null if unknown. */
export function resolveExerciseId(raw: string): string | null {
  return RESOLUTION_INDEX.get(normalizeExerciseName(raw)) ?? null;
}

/** Fetch a full catalog entry by canonical id. */
export function getExerciseById(id: string): CatalogExercise | undefined {
  return CATALOG_BY_ID.get(id);
}

/** Catalog entries that load a muscle as primary OR secondary mover. */
export function getExercisesByMuscle(muscle: MuscleGroup): CatalogExercise[] {
  return EXERCISE_CATALOG.filter(
    (e) => e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle),
  );
}

/** Catalog entries that share a biomechanical movement pattern. */
export function getExercisesByMovementPattern(
  pattern: MovementPattern,
): CatalogExercise[] {
  return EXERCISE_CATALOG.filter((e) => e.movementPattern === pattern);
}
