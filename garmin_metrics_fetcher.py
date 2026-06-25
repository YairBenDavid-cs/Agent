"""
Refined Garmin metrics fetcher.

Pulls ONLY the selected coach metrics and writes one clean, token-efficient JSON
per day, split into:

  recovery
  running  -> global (evaluation / trends)  +  per_run (each run that day)
  strength -> global (1RM / volume-load trends) + per_train (each lift that day)

Usage:
    python garmin_metrics_fetcher.py [DAYS]      # default 7

Output: ./garmin_metrics/<YYYY-MM-DD>.json  (one per day)  +  all_days.json
Auth reuses the cached token in GARMIN_TOKEN_DIR (or ./.garmin_tokens).
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from garminconnect import Garmin

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

EMAIL = os.getenv("GARMIN_EMAIL")
PASSWORD = os.getenv("GARMIN_PASSWORD")
TOKEN_DIR = os.getenv("GARMIN_TOKEN_DIR") or str(HERE / ".garmin_tokens")
OUT_DIR = HERE / "garmin_metrics"

RUN_TYPES = {"running", "trail_running", "treadmill_running", "track_running"}
STRENGTH_TYPES = {"strength_training", "indoor_cardio", "bouldering"}  # strength-like
COMPOUND_HINTS = {"BENCH_PRESS", "SQUAT", "DEADLIFT", "SHOULDER_PRESS",
                  "OVERHEAD_PRESS", "ROW", "PULL_UP", "LAT_PULLDOWN"}


# --- helpers ----------------------------------------------------------------

def r(x: Any, n: int = 1) -> Any:
    """Round floats, leave everything else."""
    return round(x, n) if isinstance(x, (int, float)) else x


def pace_per_km(speed_mps: float | None) -> str | None:
    """m/s -> 'mm:ss /km'."""
    if not speed_mps:
        return None
    sec = 1000.0 / speed_mps
    return f"{int(sec // 60)}:{int(sec % 60):02d}"


def mins(seconds: float | None) -> float | None:
    return r(seconds / 60.0, 1) if seconds else None


def epley_1rm(weight: float, reps: int) -> float:
    return weight * (1 + reps / 30.0)


def safe(fn, default=None):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001
        return {"_error": f"{type(exc).__name__}: {exc}"} if default is None else default


def ts_device(ts: dict) -> dict:
    """Return the primary device's training-status record (holds label + ACWR)."""
    if not isinstance(ts, dict):
        return {}
    latest = (ts.get("mostRecentTrainingStatus") or {}).get("latestTrainingStatusData") or {}
    for v in latest.values():
        if isinstance(v, dict):
            return v
    return {}


# --- login ------------------------------------------------------------------

def connect() -> Garmin:
    try:
        api = Garmin()
        api.login(TOKEN_DIR)
        return api
    except Exception:
        if not EMAIL or not PASSWORD:
            raise SystemExit("No cached token and no credentials in .env.")
        api = Garmin(email=EMAIL, password=PASSWORD,
                     prompt_mfa=lambda: input("MFA code: "))
        api.login()
        Path(TOKEN_DIR).mkdir(exist_ok=True)
        api.garth.dump(TOKEN_DIR)
        return api


# --- recovery block ---------------------------------------------------------

def recovery_block(api: Garmin, day: str) -> dict:
    summ = safe(lambda: api.get_user_summary(day), {})
    hrv = safe(lambda: api.get_hrv_data(day), {}) or {}
    hrv_s = (hrv.get("hrvSummary") or {}) if isinstance(hrv, dict) else {}
    base = hrv_s.get("baseline") or {}
    sleep = safe(lambda: api.get_sleep_data(day), {}) or {}
    sdto = (sleep.get("dailySleepDTO") or {}) if isinstance(sleep, dict) else {}
    scores = sdto.get("sleepScores") or {}
    tr_list = safe(lambda: api.get_training_readiness(day), []) or []
    tr = tr_list[0] if isinstance(tr_list, list) and tr_list else {}
    ts = safe(lambda: api.get_training_status(day), {}) or {}
    dev = ts_device(ts)
    acwr = dev.get("acuteTrainingLoadDTO") or {}

    total_sec = sdto.get("sleepTimeSeconds")
    need = (sdto.get("sleepNeed") or {}).get("baseline")

    return {
        "hrv_last_night": hrv_s.get("lastNightAvg"),
        "hrv_baseline_low": base.get("balancedLow"),
        "hrv_baseline_high": base.get("balancedUpper"),
        "hrv_status": hrv_s.get("status"),
        "resting_hr": summ.get("restingHeartRate"),
        "sleep_score": (scores.get("overall") or {}).get("value"),
        "sleep_minutes": mins(total_sec),
        "sleep_need_minutes": need,
        "sleep_deep_pct": (scores.get("deepPercentage") or {}).get("value"),
        "sleep_rem_pct": (scores.get("remPercentage") or {}).get("value"),
        "training_readiness_score": tr.get("score"),
        "training_readiness_level": tr.get("level"),
        "recovery_time_min": tr.get("recoveryTime"),
        "body_battery_morning_peak": summ.get("bodyBatteryHighestValue"),
        "body_battery_lowest": summ.get("bodyBatteryLowestValue"),
        "acute_load": acwr.get("dailyTrainingLoadAcute") or tr.get("acuteLoad"),
        "chronic_load": acwr.get("dailyTrainingLoadChronic"),
        "acwr_ratio": acwr.get("dailyAcuteChronicWorkloadRatio"),
        "acwr_status": acwr.get("acwrStatus"),
        "training_status": dev.get("trainingStatusFeedbackPhrase"),
        "respiration_overnight_avg": sdto.get("averageRespirationValue"),
        "spo2_overnight_avg": sdto.get("averageSpO2Value"),
        "spo2_overnight_lowest": sdto.get("lowestSpO2Value"),
        "stress_yesterday_avg": summ.get("averageStressLevel"),
        "rest_stress_minutes": mins(summ.get("restStressDuration")),
        "intensity_min_moderate": summ.get("moderateIntensityMinutes"),
        "intensity_min_vigorous": summ.get("vigorousIntensityMinutes"),
    }


# --- running ----------------------------------------------------------------

def running_global(api: Garmin, day: str, week_start: str) -> dict:
    ts = safe(lambda: api.get_training_status(day), {}) or {}
    vo2 = None
    mr = ts.get("mostRecentVO2Max") if isinstance(ts, dict) else None
    if isinstance(mr, dict):
        vo2 = (mr.get("generic") or {}).get("vo2MaxValue")

    lt = safe(lambda: api.get_lactate_threshold(), {}) or {}
    lt_shr = (lt.get("speed_and_heart_rate") or {}) if isinstance(lt, dict) else {}

    rp = safe(lambda: api.get_race_predictions(), {}) or {}
    hill = safe(lambda: api.get_hill_score(week_start, day), {}) or {}
    endur = safe(lambda: api.get_endurance_score(week_start, day), {}) or {}
    tol = safe(lambda: api.get_running_tolerance(week_start, day), []) or []
    tol_last = tol[-1] if isinstance(tol, list) and tol else {}
    wim = safe(lambda: api.get_weekly_intensity_minutes(week_start, day), []) or []
    wim_last = wim[-1] if isinstance(wim, list) and wim else {}

    return {
        "vo2max": vo2,
        # NOTE: Garmin's LT 'speed' field is unreliably scaled; HR is the trustworthy
        # LT marker. Raw speed is kept so the agent can calibrate units if needed.
        "lactate_threshold_hr": lt_shr.get("heartRate"),
        "lactate_threshold_speed_raw": lt_shr.get("speed"),
        "race_pred_5k_sec": rp.get("time5K"),
        "race_pred_10k_sec": rp.get("time10K"),
        "race_pred_half_sec": rp.get("timeHalfMarathon"),
        "race_pred_marathon_sec": rp.get("timeMarathon"),
        "running_tolerance": tol_last.get("tolerance"),
        "hill_score": (hill.get("maxScore") if isinstance(hill, dict) else None),
        "endurance_score": (endur.get("avg") if isinstance(endur, dict) else None),
        "training_status": ts_device(ts).get("trainingStatusFeedbackPhrase"),
        "weekly_distance_km": r((tol_last.get("totalDistance") or 0) / 1000.0, 2),
        "weekly_intensity_moderate": wim_last.get("moderateValue"),
        "weekly_intensity_vigorous": wim_last.get("vigorousValue"),
    }


def run_entry(api: Garmin, a: dict) -> dict:
    splits = []
    try:
        sp = api.get_activity_splits(a["activityId"])
        for lap in (sp.get("lapDTOs") or []):
            splits.append({
                "distance_m": r(lap.get("distance"), 0),
                "pace": pace_per_km(lap.get("averageSpeed")),
                "avg_hr": r(lap.get("averageHR"), 0),
            })
    except Exception:
        pass
    return {
        "type": a.get("activityType", {}).get("typeKey"),
        "name": a.get("activityName"),
        "distance_km": r((a.get("distance") or 0) / 1000.0, 2),
        "duration_min": mins(a.get("duration")),
        "avg_pace": pace_per_km(a.get("averageSpeed")),
        "avg_hr": r(a.get("averageHR"), 0),
        "max_hr": r(a.get("maxHR"), 0),
        "aerobic_te": a.get("aerobicTrainingEffect"),
        "anaerobic_te": a.get("anaerobicTrainingEffect"),
        "te_label": a.get("trainingEffectLabel"),
        "training_load": r(a.get("activityTrainingLoad"), 1),
        "calories": r(a.get("calories"), 0),
        "elevation_gain_m": r(a.get("elevationGain"), 0),
        "avg_cadence": r(a.get("averageRunningCadenceInStepsPerMinute"), 0),
        "avg_stride_length_cm": r(a.get("avgStrideLength"), 1),
        "avg_ground_contact_ms": r(a.get("avgGroundContactTime"), 0),
        "splits": splits,
    }


# --- strength ---------------------------------------------------------------

def strength_entry(api: Garmin, a: dict) -> dict:
    """Per-session strength log with per-category breakdown + volume load."""
    by_cat: dict[str, dict] = defaultdict(
        lambda: {"sets": 0, "reps": 0, "top_weight_kg": 0.0, "volume_load": 0.0,
                 "est_1rm_kg": 0.0})
    try:
        es = api.get_activity_exercise_sets(a["activityId"])
        for s in (es.get("exerciseSets") or []):
            if s.get("setType") != "ACTIVE":
                continue
            exs = s.get("exercises") or [{}]
            cat = (exs[0].get("name") or exs[0].get("category") or "UNKNOWN")
            reps = s.get("repetitionCount") or 0
            w = s.get("weight") or 0.0          # grams
            wkg = w / 1000.0 if w else 0.0
            c = by_cat[cat]
            c["sets"] += 1
            c["reps"] += reps
            c["top_weight_kg"] = max(c["top_weight_kg"], r(wkg, 1))
            c["volume_load"] += round(wkg * reps, 1)
            if wkg > 0 and reps > 0:
                c["est_1rm_kg"] = max(c["est_1rm_kg"], round(epley_1rm(wkg, reps), 1))
    except Exception:
        pass

    exercises = [{"category": k, **v} for k, v in by_cat.items()]
    session_volume = round(sum(e["volume_load"] for e in exercises), 1)

    return {
        "type": a.get("activityType", {}).get("typeKey"),
        "name": a.get("activityName"),
        "duration_min": mins(a.get("duration")),
        "avg_hr": r(a.get("averageHR"), 0),
        "max_hr": r(a.get("maxHR"), 0),
        "calories": r(a.get("calories"), 0),
        "aerobic_te": a.get("aerobicTrainingEffect"),
        "anaerobic_te": a.get("anaerobicTrainingEffect"),
        "te_label": a.get("trainingEffectLabel"),
        "training_load": r(a.get("activityTrainingLoad"), 1),
        "total_sets": a.get("totalSets"),
        "total_reps": a.get("totalReps"),
        "session_volume_load": session_volume,
        "exercises": exercises,
    }


def strength_global(strength_sessions_window: list[dict]) -> dict:
    """1RM + volume-load trends derived from per-session logs in the window."""
    best_1rm: dict[str, float] = {}
    total_volume = 0.0
    for sess in strength_sessions_window:
        total_volume += sess.get("session_volume_load", 0) or 0
        for ex in sess.get("exercises", []):
            if ex["est_1rm_kg"] > 0:
                best_1rm[ex["category"]] = max(best_1rm.get(ex["category"], 0),
                                               ex["est_1rm_kg"])
    return {
        "est_1rm_kg": best_1rm or None,
        "weekly_volume_load": round(total_volume, 1),
        "note": ("no external load recorded (bodyweight) — 1RM/volume need weight input"
                 if not best_1rm else None),
    }


# --- assemble ---------------------------------------------------------------

def local_date(a: dict) -> str:
    return (a.get("startTimeLocal") or "")[:10]


def main() -> None:
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    api = connect()
    today = dt.date.today()
    date_list = [(today - dt.timedelta(days=i)).isoformat() for i in range(days)]
    range_start = date_list[-1]

    # one activities pull for the whole window, grouped by local date
    acts = safe(lambda: api.get_activities_by_date(range_start, today.isoformat()), []) or []
    by_day: dict[str, list] = defaultdict(list)
    for a in acts:
        by_day[local_date(a)].append(a)

    OUT_DIR.mkdir(exist_ok=True)
    all_days = {}

    for day in date_list:
        week_start = (dt.date.fromisoformat(day) - dt.timedelta(days=6)).isoformat()
        day_acts = by_day.get(day, [])
        runs = [a for a in day_acts if a.get("activityType", {}).get("typeKey") in RUN_TYPES]
        lifts = [a for a in day_acts
                 if a.get("activityType", {}).get("typeKey") in STRENGTH_TYPES]

        per_train = [strength_entry(api, a) for a in lifts]

        record = {
            "date": day,
            "recovery": recovery_block(api, day),
            "running": {
                "global": running_global(api, day, week_start),
                "per_run": [run_entry(api, a) for a in runs],
            },
            "strength": {
                "global": strength_global(per_train),
                "per_train": per_train,
            },
        }
        (OUT_DIR / f"{day}.json").write_text(json.dumps(record, indent=2, default=str))
        all_days[day] = record
        print(f"  {day}: {len(runs)} run(s), {len(lifts)} lift(s)")

    (OUT_DIR / "all_days.json").write_text(json.dumps(all_days, indent=2, default=str))
    print(f"\nWrote {len(date_list)} day files to {OUT_DIR}")


if __name__ == "__main__":
    main()
