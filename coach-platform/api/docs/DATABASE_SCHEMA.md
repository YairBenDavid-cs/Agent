# Database Schema Reference

MongoDB collections for `coach-platform/api`, defined with NestJS Mongoose (`@nestjs/mongoose`).

**Conventions shared across all collections:**

- All root documents use `timestamps: true` → auto `createdAt` / `updatedAt`.
- Dates are stored as **strings** (`YYYY-MM-DD` or ISO), not native `Date`.
- The tenant key is a string `user_id` (not an ObjectId ref).
- Embedded sub-documents are declared with `_id: false`.
- Garmin-sourced collections carry a `content_hash` for ingest idempotency.

> The `exercises` module is an **in-memory catalog** (`exercise-catalog.model.ts`) and has **no Mongo collection**.

## Collections at a glance

| # | Collection | Purpose | Source file |
|---|---|---|---|
| 1 | `users` | Account + onboarding profile | `users/infrastructure/user.schema.ts` |
| 2 | `auth_credentials` | Password hashes at rest | `auth/infrastructure/auth-credentials.schema.ts` |
| 3 | `auth_sessions` | Refresh-token sessions | `auth/infrastructure/auth-session.schema.ts` |
| 4 | `sessions` | Completed workouts (Garmin) | `sessions/infrastructure/session.schema.ts` |
| 5 | `training_profiles` | Onboarding output | `training/infrastructure/training-profile.schema.ts` |
| 6 | `programs` | Multi-week training plans | `program/infrastructure/program.schema.ts` |
| 7 | `planned_sessions` | Prescribed workouts + outcome | `planned-sessions/infrastructure/planned-session.schema.ts` |
| 8 | `user_integrations` | Encrypted 3rd-party credentials | `integrations/infrastructure/user-integrations.schema.ts` |
| 9 | `recovery_daily` | Daily recovery metrics | `recovery/infrastructure/recovery-daily.schema.ts` |
| 10 | `performance_daily` | Daily performance metrics | `performance/infrastructure/performance-daily.schema.ts` |
| 11 | `performance_profile` | Append-only metric change log | `performance/infrastructure/performance-profile.schema.ts` |
| 12 | `user_preferences` | Preference projection | `personalization/infrastructure/user-preferences.schema.ts` |
| 13 | `preference_events` | Preference event stream | `personalization/infrastructure/preference-event.schema.ts` |
| 14 | `health_constraints` | Injuries / limitations | `personalization/infrastructure/health-constraint.schema.ts` |

---

## 1. `users`

Core account + onboarding profile.

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | **required, unique** |
| `email` | string | **required, unique** |
| `name` | string | required |
| `date_of_birth` | string \| null | default null |
| `sex` | enum `male` / `female` / `other` / null | default null |
| `country` | string \| null | default null |
| `timezone` | string \| null | default null |
| `locale` | string | required, default `en` |
| `units` | enum `metric` / `imperial` | required, default `metric` |
| `height_cm` | number \| null | default null |
| `weight_kg` | number \| null | default null |
| `status` | enum `active` / `disabled` | required, default `active` |
| `role` | enum `user` / `admin` | required, default `user` |

**Indexes:** unique `user_id`; unique `email`.

---

## 2. `auth_credentials`

Password hashes at rest. Separate from `users` for stricter access control.

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | **required, unique** |
| `password_hash` | string | required |
| `algo` | string | required |

**Indexes:** unique `user_id`.

---

## 3. `auth_sessions`

Refresh-token sessions, one per login.

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required, indexed |
| `jti` | string | **required, unique** |
| `refresh_token_hash` | string | required |
| `expires_at` | string | required |
| `revoked_at` | string \| null | default null |

**Indexes:**
- unique `jti`
- `{ user_id: 1 }`
- `{ user_id: 1, revoked_at: 1 }` — active sessions per user

---

## 4. `sessions`

Completed workouts ingested from Garmin. Polymorphic on `type`.

**Root (`WorkoutSessionDoc`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `activity_id` | number | required |
| `date` | string | required |
| `type` | enum `running` / `strength` | required |
| `subtype` | string \| null | default null |
| `source` | string | required, default `garmin` |
| `content_hash` | string | required |
| `running` | RunningDetail \| null | embedded, default null |
| `strength` | StrengthDetail \| null | embedded, default null |

**Embedded `running` (RunningDetailClass):** `name`, `distance_km`, `duration_min`, `avg_pace`, `avg_hr`, `max_hr`, `aerobic_te`, `anaerobic_te`, `te_label`, `training_load`, `calories`, `elevation_gain_m`, `avg_cadence`, `avg_stride_length_cm`, `avg_ground_contact_ms`, `splits[]`.
- **`splits[]` (RunningSplitClass):** `{ distance_m, pace, avg_hr }`

**Embedded `strength` (StrengthDetailClass):** `name`, `duration_min`, `avg_hr`, `max_hr`, `calories`, `aerobic_te`, `anaerobic_te`, `te_label`, `training_load`, `total_sets`, `total_reps`, `session_volume_load`, `exercises[]`.
- **`exercises[]` (ExerciseAggregateClass):** `{ category (required), sets, reps, top_weight_kg, volume_load, est_1rm_kg }`

**Indexes:**
- `{ user_id: 1, activity_id: 1 }` **unique** — dedup
- `{ user_id: 1, date: -1 }`
- `{ user_id: 1, type: 1, date: -1 }`

---

## 5. `training_profiles`

Onboarding output. Exactly one of `run` / `strength` is populated, gated by `discipline`.

**Root (`TrainingProfile`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `discipline` | enum `running` / `strength` | required |
| `goal` | Goal (embedded) | required |
| `availability` | AvailabilitySlot[] | default [] |
| `session_duration_min` | number | required, min 1 |
| `run` | RunPrefs \| null | when discipline = running |
| `strength` | StrengthPrefs \| null | when discipline = strength |
| `status` | enum `in_progress` / `active` / `completed` | required, default `active` |
| `completed_at` | string \| null | default null |

**Embedded `goal` (GoalSchemaClass):** `{ primary_goal (enum: build_endurance / lose_weight / build_muscle / get_stronger / race_prep / general_fitness), note, horizon (YYYY-MM-DD) }`

**Embedded `availability[]` (AvailabilitySlotSchemaClass):** `{ day (enum mon..sun), start_time, end_time }`

**Embedded `run` (RunPrefsSchemaClass):** `weekly_km` (required, min 0), `liked_run_types[]` (enum: easy / tempo / fartlek / intervals / long / recovery), `experience_level` (enum beginner / intermediate / advanced \| null), `longest_recent_km`, `target_race`, `recent_5k_time`.

**Embedded `strength` (StrengthPrefsSchemaClass):** `target_muscle_groups[]` (enum: chest / back / shoulders / arms / legs / glutes / core / full_body), `exercises_per_session` (required, min 1), `sets_per_exercise` (required, min 1), `reps_per_exercise` (required, min 1), `equipment[]` (enum: bodyweight / dumbbells / barbell / kettlebell / machines / resistance_bands / cables / pullup_bar), `preferred_exercises[]`, `training_modalities[]` (enum: gym / crossfit / hyrox / hiit / calisthenics / powerlifting / bodybuilding), `experience_level` (enum \| null), `split_preference` (enum: full_body / upper_lower / push_pull_legs / bro_split \| null).

**Indexes:** `{ user_id: 1 }` **unique partial** where `status: 'active'` — at most one active profile per user.

---

## 6. `programs`

Multi-week training plan seeded from a profile.

**Root (`ProgramDoc`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `training_profile_id` | string \| null | default null |
| `discipline` | enum `running` / `strength` | required |
| `goal_snapshot` | GoalSnapshot (embedded) | required |
| `start_date` | string | required |
| `horizon_date` | string | required |
| `status` | enum `active` / `completed` / `abandoned` | required, default `active` |
| `current_week_index` | number | required, default 0 |
| `weeks` | ProgramWeek[] | default [] |

**Embedded `goal_snapshot` (GoalSnapshotClass):** `{ primary_goal, note, horizon (YYYY-MM-DD) }`

**Embedded `weeks[]` (ProgramWeekClass):** `week_index` (min 0), `start_date`, `end_date`, `theme` (enum: base / build / peak / deload / taper), `planned_load_target`, `plan_state` (enum committed / tentative), `status` (enum upcoming / current / done), `generated_at`.

**Indexes:**
- `{ user_id: 1 }` **unique partial** where `status: 'active'`
- `{ user_id: 1, status: 1, start_date: -1 }`

---

## 7. `planned_sessions`

Prescribed future workouts + outcome + calendar sync.

**Root (`PlannedSessionDoc`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `program_id` | string | required |
| `week_index` | number | required, min 0 |
| `slot_key` | string | required |
| `type` | enum `running` / `strength` | required |
| `scheduled_date` | string | required |
| `start_time` | string | required |
| `end_time` | string | required |
| `timezone` | string | required |
| `scheduled_start_utc` | string | required |
| `plan_state` | enum `committed` / `tentative` | required |
| `title` | string | required |
| `est_duration_min` | number | required |
| `intensity_label` | string | required |
| `coach_notes` | string \| null | default null |
| `running` | RunningPlan \| null | embedded |
| `strength` | StrengthPlan \| null | embedded |
| `outcome` | PlannedOutcome | default `{ status: 'planned' }` |
| `calendar_sync` | CalendarSync \| null | embedded |

**Embedded `running` (RunningPlanClass):** `run_type` (enum easy / tempo / fartlek / intervals / long / recovery), `total_distance_km`, `total_duration_min`, `target_pace`, `target_hr_zone`, `target_rpe`, `segments[]`.
- **`segments[]` (RunSegmentClass):** `{ kind (enum warmup / work / recovery / cooldown), repeat (default 1), distance_m, duration_sec, target_pace, target_hr_zone, rest_sec }`

**Embedded `strength` (StrengthPlanClass):** `split_focus`, `target_volume_load`, `exercises[]`.
- **`exercises[]` (PlannedExerciseClass):** `{ name, category, order, sets, target_reps_min, target_reps_max, target_weight_kg, target_pct_1rm, target_rir, rest_sec, tempo, superset_group }`

**Embedded `outcome` (PlannedOutcomeClass):** `status` (enum planned / completed / partially_completed / skipped / deviated), `reason_code` (enum \| null: disliked_time / disliked_exercise / volume_too_high / volume_too_low / too_hard / too_easy / no_motivation / injury_or_illness / time_constraint / weather / travel / other), `perceived_effort`, `enjoyment`, `matched_activity_id`, `feedback_ref`, `recorded_at`.

**Embedded `calendar_sync` (CalendarSyncClass):** `provider` (default `google`), `event_id`, `synced_at`, `sync_state` (enum pending / synced / failed).

**Indexes:**
- `{ user_id: 1, scheduled_date: 1 }`
- `{ user_id: 1, program_id: 1, week_index: 1 }`
- `{ user_id: 1, 'outcome.status': 1, scheduled_date: 1 }`
- `{ user_id: 1, 'outcome.matched_activity_id': 1 }` **sparse**
- `{ program_id: 1, week_index: 1, slot_key: 1 }` **unique** — generator idempotency

---

## 8. `user_integrations`

Encrypted third-party credentials (ciphertext only).

**Root (`UserIntegrations`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | **required, unique** |
| `garmin` | GarminCreds \| null | embedded |
| `google_calendar` | GoogleCalendarCreds \| null | embedded |
| `telegram` | TelegramCreds \| null | embedded |

**Embedded `garmin` (GarminCreds):** `{ email, password_enc, session_enc, session_expires_at, updated_at }`
**Embedded `google_calendar` (GoogleCalendarCreds):** `{ refresh_token_enc, updated_at }`
**Embedded `telegram` (TelegramCreds):** `{ chat_id, bot_token_enc, updated_at }`

**Indexes:** unique `user_id`.

---

## 9. `recovery_daily`

One Garmin recovery snapshot per user per day. All metrics nullable (missing readings must not block persistence).

**Root (`RecoveryDaily`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `date` | string | required (YYYY-MM-DD) |
| `source` | string | required, default `garmin` |
| `content_hash` | string | required |
| `ingestion_status` | enum `ok` / `partial` / `failed` | required, default `ok` |
| `warnings` | `{ field, reason }[]` | default [] |
| `recovery` | RecoveryMetrics (embedded) | required |

**Embedded `recovery` (RecoveryMetricsSchemaClass)** — all `number \| null` / `string \| null`, default null: `hrv_last_night`, `hrv_status`, `resting_hr`, `sleep_score`, `sleep_minutes`, `sleep_deep_pct`, `sleep_rem_pct`, `training_readiness_score`, `training_readiness_level`, `recovery_time_min`, `body_battery_morning_peak`, `body_battery_lowest`, `acute_load`, `chronic_load`, `acwr_ratio`, `acwr_status`, `training_status`, `respiration_overnight_avg`, `spo2_overnight_avg`, `spo2_overnight_lowest`, `stress_yesterday_avg`, `rest_stress_minutes`, `intensity_min_moderate`, `intensity_min_vigorous`, `hrv_baseline_low`, `hrv_baseline_high`, `sleep_need_minutes`.

**Indexes:** `{ user_id: 1, date: -1 }` **unique**.

---

## 10. `performance_daily`

Daily derived performance, one per user per day.

**Root (`PerformanceDaily`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `date` | string | required |
| `source` | string | required, default `garmin` |
| `content_hash` | string | required |
| `ingestion_status` | enum `ok` / `partial` / `failed` | required, default `ok` |
| `warnings` | `{ field, reason }[]` | default [] |
| `running` | PerformanceRunningDaily (embedded) | required |
| `strength` | PerformanceStrengthDaily (embedded) | required |

**Embedded `running`:** `{ running_tolerance, weekly_distance_km, weekly_intensity_moderate, weekly_intensity_vigorous }` (all number \| null)
**Embedded `strength`:** `{ weekly_volume_load }` (number \| null)

**Indexes:** `{ user_id: 1, date: -1 }` **unique**.

---

## 11. `performance_profile`

Append-only per-metric change log. Current state = latest entry per metric; trend = all entries for a metric.

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `metric` | string | required |
| `value` | number | required |
| `effective_date` | string | required (YYYY-MM-DD) |
| `source` | string | required, default `garmin` |

**Indexes:**
- `{ user_id: 1, metric: 1, effective_date: -1 }` — current value + trend
- `{ user_id: 1, metric: 1, effective_date: 1 }` **unique** — one entry per metric per day

---

## 12. `user_preferences`

Rebuilt projection of inferred/explicit preferences, one per (user, discipline).

**Root (`UserPreferencesDoc`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `discipline` | enum `running` / `strength` | required |
| *(list fields)* | PrefEntry[] | default [] |
| *(single fields)* | PrefEntry \| null | default null |
| `source_event_count` | number | required, default 0 |
| `taxonomy_version` | number | required |
| `rebuilt_at` | string | required |

**List fields (`PrefEntry[]`):** `avoided_exercises`, `preferred_exercises`, `blocked_time_windows`, `preferred_time_windows`, `removed_equipment`, `added_equipment`, `preferred_modalities`, `preferred_run_types`, `avoided_run_types`, `target_muscle_groups`, `exercise_prescriptions`.

**Single fields (`PrefEntry \| null`):** `volume_bias`, `intensity_bias`, `diversity_bias`, `session_duration_min`, `sessions_per_week`, `weekly_km`, `split_preference`, `exercises_per_session`, `default_sets`, `default_reps`, `experience_level`, `primary_goal`.

**Embedded `PrefEntry` (PrefEntryClass):** `{ value (Mixed: string | number | object), strength (enum hard / soft), confidence (enum explicit / inferred), support_count (default 0), source_event_ids[], first_seen, last_reinforced, confirmed (bool, default false) }`

**Indexes:** `{ user_id: 1, discipline: 1 }` **unique** — rebuild upserts on this key.

---

## 13. `preference_events`

Append-only event stream feeding the `user_preferences` projection.

**Root (`PreferenceEventDoc`):**

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `event_date` | string | required |
| `source` | enum `revision` / `outcome` / `assistant` / `session_flush` | required |
| `batch_id` | string \| null | default null |
| `discipline` | enum `running` / `strength` \| null | default null |
| `scope` | enum `global` / `session` / `exercise` | required |
| `durability` | enum `standing` / `one_off` | required |
| `expires_at` | string \| null | default null |
| `target` | PreferenceTarget \| null | embedded |
| `tag` | PreferenceTag (embedded) | required |
| `raw_text` | string | required, default `''` |
| `applied_to_projection` | boolean | required, default false |
| `taxonomy_version` | number | required |

**Embedded `tag` (PreferenceTagClass):** `{ type (enum — reused reason codes + preference-specific: equipment_removed / equipment_added / time_window_blocked / time_window_preferred / diversity_request / volume_bias / intensity_bias / modality_pref / exercise_override / injury / other), value (Mixed: string | number | null), polarity (enum avoid / prefer / increase / decrease / neutral), confidence (enum explicit / inferred) }`

**Embedded `target` (PreferenceTargetClass):** `{ planned_session_id, exercise_id, run_type (enum \| null) }`

**Indexes:**
- `{ user_id: 1, event_date: -1 }` — timeline
- `{ user_id: 1, 'tag.type': 1 }` — tag-type filter
- `{ user_id: 1, discipline: 1, event_date: -1 }` — per-discipline slice
- `{ user_id: 1, batch_id: 1 }` **sparse** — group/replay a revision submit

---

## 14. `health_constraints`

Injuries / limitations the generator must respect.

| Field | Type | Notes |
|---|---|---|
| `user_id` | string | required |
| `type` | enum `injury` / `mobility_limitation` / `medical` / `other` | required |
| `label` | string | required |
| `affected_muscles` | string[] | default [] |
| `affected_movement_patterns` | string[] | default [] |
| `avoid_exercise_ids` | string[] | default [] |
| `severity` | enum `avoid` / `caution` | required |
| `status` | enum `active` / `resolved` | required, default `active` |
| `source_event_ids` | string[] | default [] |
| `noted_at` | string | required |
| `resolved_at` | string \| null | default null |

**Indexes:** `{ user_id: 1, status: 1 }` — fetch a user's currently-active constraints.
