"""
Stateless Garmin fetch service (Option B in the design).

NestJS is the sole DB writer; this service only authenticates to Garmin, pulls
the selected coach metrics for a date range, and returns them normalized to the
exact contract the NestJS ingestion orchestrator validates (FetchResultDto).

It owns NO database and NO persistence: credentials/token in -> metrics out.

The per-metric extraction logic is NOT duplicated here — it is imported from the
existing `garmin_metrics_fetcher.py` so there is a single source of truth for
field names and Garmin quirks. Point FETCHER_SRC_DIR at the directory holding it.
"""

from __future__ import annotations

import datetime as dt
import os
import sys
import time
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)
from pydantic import BaseModel, Field

# --- import the existing extractor as the single source of truth -------------

FETCHER_SRC_DIR = os.environ.get(
    "FETCHER_SRC_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
)
sys.path.insert(0, FETCHER_SRC_DIR)
import garmin_metrics_fetcher as gm  # noqa: E402

app = FastAPI(title="Coach Platform — Garmin Fetch Service", version="1.0.0")


# --- request / response contracts -------------------------------------------

class AuthIn(BaseModel):
    email: str
    password: str
    # Serialized garth session (api.garth.dumps()), reused to skip a fresh login.
    session: str | None = None


class FetchIn(BaseModel):
    from_: str = Field(alias="from")  # YYYY-MM-DD inclusive
    to: str  # YYYY-MM-DD inclusive
    auth: AuthIn

    model_config = {"populate_by_name": True}


class AuthRequest(BaseModel):
    email: str
    password: str


class MfaRequest(BaseModel):
    loginId: str
    code: str


# --- pending MFA logins ------------------------------------------------------
# A Garmin login that hits a 2FA challenge returns a `client_state` dict holding
# LIVE garth objects (not JSON-serializable), which `resume_login` needs. We keep
# it — plus the partially-built Garmin client — in memory between the /auth and
# /auth/mfa calls, keyed by an opaque loginId.
#
# Limitation: this is process-local and lost on restart, and assumes a single
# service instance. That is acceptable for the current single-instance,
# localhost deployment; a horizontally-scaled deployment would need shared state.
PENDING: dict[str, dict[str, Any]] = {}
PENDING_TTL_SECONDS = 5 * 60


def _sweep_pending() -> None:
    cutoff = time.monotonic() - PENDING_TTL_SECONDS
    for key in [k for k, v in PENDING.items() if v["ts"] < cutoff]:
        PENDING.pop(key, None)


# garminconnect logs in via a cascade of strategies. The mobile AND portal
# strategies report a wrong password and a 2FA challenge DETERMINISTICALLY from
# JSON (responseStatus = INVALID_USERNAME_PASSWORD / MFA_REQUIRED). The "widget"
# strategy is the odd one out: it GUESSES 2FA from the page <title> — and
# Garmin's own sign-in page is titled "GARMIN Authentication Application", so a
# rejected-password re-render gets misread as a 2FA challenge. That is exactly
# why a wrong password was prompting for a verification code. We skip ONLY the
# widget strategy, so the wrong-password vs. 2FA decision is always made from a
# deterministic JSON signal.
#
# The portal strategies are kept: they bypass the mobile clientId rate limits
# (Cloudflare + TLS-fingerprint rotation), so login still works when the mobile
# endpoints return 429 — without the widget flow's ambiguity.
SKIP_TITLE_HEURISTIC_STRATEGIES = {"widget+cffi"}


def _new_login_client(email: str, password: str, return_on_mfa: bool) -> Garmin:
    api = Garmin(email=email, password=password, return_on_mfa=return_on_mfa)
    api.client.skip_strategies = set(SKIP_TITLE_HEURISTIC_STRATEGIES)
    return api


# Profile candidate metric names must match the NestJS regex.
PROFILE_FROM_RUNNING = {
    "vo2max": "vo2max",
    "lactate_threshold_hr": "lt_hr",
    "lactate_threshold_speed_raw": "lt_speed_raw",
    "race_pred_5k_sec": "race_pred_5k_sec",
    "race_pred_10k_sec": "race_pred_10k_sec",
    "race_pred_half_sec": "race_pred_half_sec",
    "race_pred_marathon_sec": "race_pred_marathon_sec",
    "hill_score": "hill_score",
    "endurance_score": "endurance_score",
}

RECOVERY_KEYS = [
    "hrv_last_night", "hrv_status", "resting_hr", "sleep_score", "sleep_minutes",
    "sleep_deep_pct", "sleep_rem_pct", "training_readiness_score",
    "training_readiness_level", "recovery_time_min", "body_battery_morning_peak",
    "body_battery_lowest", "acute_load", "chronic_load", "acwr_ratio",
    "acwr_status", "training_status", "respiration_overnight_avg",
    "spo2_overnight_avg", "spo2_overnight_lowest", "stress_yesterday_avg",
    "rest_stress_minutes", "intensity_min_moderate", "intensity_min_vigorous",
    "hrv_baseline_low", "hrv_baseline_high", "sleep_need_minutes",
]

RUNNING_DETAIL_KEYS = [
    "name", "distance_km", "duration_min", "avg_pace", "avg_hr", "max_hr",
    "aerobic_te", "anaerobic_te", "te_label", "training_load", "calories",
    "elevation_gain_m", "avg_cadence", "avg_stride_length_cm",
    "avg_ground_contact_ms", "splits",
]

STRENGTH_DETAIL_KEYS = [
    "name", "duration_min", "avg_hr", "max_hr", "calories", "aerobic_te",
    "anaerobic_te", "te_label", "training_load", "total_sets", "total_reps",
    "session_volume_load", "exercises",
]


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _scrub(value: Any) -> Any:
    """Drop the fetcher's {"_error": ...} sentinels to null; leave the rest."""
    if isinstance(value, dict) and "_error" in value:
        return None
    return value


def _pick(source: dict, keys: list[str]) -> dict:
    """Whitelist only the keys the NestJS DTO accepts (forbidNonWhitelisted)."""
    return {k: _scrub(source.get(k)) for k in keys}


def _sanitize_1rm_category(cat: str) -> str | None:
    token = "".join(c if c.isalpha() else "_" for c in cat.upper())
    token = token.strip("_")
    return token or None


def build_client(auth: AuthIn) -> Garmin:
    """Resume from a cached session if given, else log in with credentials.

    A bad/expired credential is a clean rejection (401) — the caller must not
    blind-retry; it should re-auth. Connection problems propagate as 5xx so the
    caller's transient-retry kicks in.
    """
    if auth.session:
        try:
            api = Garmin()
            api.client.loads(auth.session)
            if api.client.di_refresh_token and api.client._token_expires_soon():
                api.client._refresh_session()
            return api
        except Exception:
            pass  # fall through to a full login

    if not auth.email or not auth.password:
        raise HTTPException(status_code=401, detail="No valid session or credentials.")
    try:
        api = _new_login_client(auth.email, auth.password, return_on_mfa=False)
        api.login()
        return api
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail=f"Garmin auth failed: {exc}")


def dump_session(api: Garmin) -> dict | None:
    try:
        if not api.client.is_authenticated:
            return None
        token = api.client.dumps()
    except Exception:
        return None
    expires = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=350)).isoformat()
    return {"token": token, "expiresAt": expires}


def build_day(api: Garmin, day: str, day_acts: list[dict]) -> dict:
    week_start = (dt.date.fromisoformat(day) - dt.timedelta(days=6)).isoformat()
    warnings: list[dict] = []

    recovery_raw = gm.recovery_block(api, day)
    recovery = _pick(recovery_raw, RECOVERY_KEYS)

    running_raw = gm.running_global(api, day, week_start)
    performance = {
        "running": {
            "running_tolerance": _scrub(running_raw.get("running_tolerance")),
            "weekly_distance_km": _scrub(running_raw.get("weekly_distance_km")),
            "weekly_intensity_moderate": _scrub(
                running_raw.get("weekly_intensity_moderate")
            ),
            "weekly_intensity_vigorous": _scrub(
                running_raw.get("weekly_intensity_vigorous")
            ),
        },
        "strength": {"weekly_volume_load": None},
    }

    runs = [
        a for a in day_acts
        if a.get("activityType", {}).get("typeKey") in gm.RUN_TYPES
    ]
    lifts = [
        a for a in day_acts
        if a.get("activityType", {}).get("typeKey") in gm.STRENGTH_TYPES
    ]
    per_train = [gm.strength_entry(api, a) for a in lifts]
    strength_glob = gm.strength_global(per_train)
    performance["strength"]["weekly_volume_load"] = _scrub(
        strength_glob.get("weekly_volume_load")
    )

    # --- slow-moving profile candidates (appended only when changed) ---------
    candidates: list[dict] = []
    for src_key, metric in PROFILE_FROM_RUNNING.items():
        val = _scrub(running_raw.get(src_key))
        if _is_number(val):
            candidates.append({"metric": metric, "value": val, "effectiveDate": day})

    one_rm = strength_glob.get("est_1rm_kg") or {}
    if isinstance(one_rm, dict):
        for cat, val in one_rm.items():
            token = _sanitize_1rm_category(str(cat))
            if token and _is_number(val):
                candidates.append(
                    {"metric": f"1rm.{token}", "value": val, "effectiveDate": day}
                )

    # --- sessions ------------------------------------------------------------
    sessions: list[dict] = []
    for a in runs:
        detail = gm.run_entry(api, a)
        subtype = detail.get("type")
        sessions.append({
            "activityId": int(a["activityId"]),
            "date": day,
            "type": "running",
            "subtype": subtype,
            "running": _pick(detail, RUNNING_DETAIL_KEYS),
            "strength": None,
        })
    for a, detail in zip(lifts, per_train):
        subtype = detail.get("type")
        sessions.append({
            "activityId": int(a["activityId"]),
            "date": day,
            "type": "strength",
            "subtype": subtype,
            "running": None,
            "strength": _pick(detail, STRENGTH_DETAIL_KEYS),
        })

    status = "ok"
    if all(v is None for v in recovery.values()):
        status = "partial"
        warnings.append({"field": "recovery", "reason": "no recovery data for day"})

    return {
        "date": day,
        "status": status,
        "warnings": warnings,
        "recovery": recovery,
        "performance": performance,
        "profileCandidates": candidates,
        "sessions": sessions,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth")
def auth(req: AuthRequest) -> dict:
    """Authenticate to Garmin. Distinguishes the three outcomes the onboarding
    flow cares about: ok (with a session to cache), 2FA required (a code is owed),
    and bad credentials. Real connection problems surface as 5xx so the caller's
    transient-retry applies."""
    _sweep_pending()
    if not req.email or not req.password:
        return {"status": "invalid_credentials"}
    try:
        api = _new_login_client(req.email, req.password, return_on_mfa=True)
        result1, result2 = api.login()
    except GarminConnectAuthenticationError:
        # Rejected credentials: a clean "try again", not a retryable failure.
        return {"status": "invalid_credentials"}
    except (GarminConnectConnectionError, GarminConnectTooManyRequestsError) as exc:
        # Real connection/throttling problem: 5xx so the caller's transient-retry
        # kicks in instead of telling the user their password is wrong.
        raise HTTPException(status_code=503, detail=f"Garmin unreachable: {exc}")

    if result1 == "needs_mfa":
        login_id = uuid.uuid4().hex
        PENDING[login_id] = {"api": api, "state": result2, "ts": time.monotonic()}
        return {"status": "mfa_required", "loginId": login_id}

    return {"status": "ok", "session": dump_session(api)}


@app.post("/auth/mfa")
def auth_mfa(req: MfaRequest) -> dict:
    """Complete a pending 2FA login with the code the user received."""
    _sweep_pending()
    entry = PENDING.get(req.loginId)
    if entry is None:
        return {"status": "expired"}
    api: Garmin = entry["api"]
    try:
        api.resume_login(entry["state"], req.code)
    except Exception:  # noqa: BLE001 — a wrong/expired code; let the user retry
        return {"status": "invalid_code"}
    PENDING.pop(req.loginId, None)
    return {"status": "ok", "session": dump_session(api)}


@app.post("/fetch")
def fetch(req: FetchIn) -> dict:
    api = build_client(req.auth)

    start = dt.date.fromisoformat(req.from_)
    end = dt.date.fromisoformat(req.to)
    if start > end:
        raise HTTPException(status_code=400, detail='"from" must not be after "to".')

    date_list = [
        (start + dt.timedelta(days=i)).isoformat()
        for i in range((end - start).days + 1)
    ]

    acts = gm.safe(
        lambda: api.get_activities_by_date(req.from_, req.to), []
    ) or []
    by_day: dict[str, list] = {}
    for a in acts:
        by_day.setdefault(gm.local_date(a), []).append(a)

    days = []
    for day in date_list:
        try:
            days.append(build_day(api, day, by_day.get(day, [])))
        except Exception as exc:  # noqa: BLE001 — isolate a single bad day
            days.append({
                "date": day,
                "status": "failed",
                "warnings": [{"field": "day", "reason": f"{type(exc).__name__}: {exc}"}],
                "recovery": {k: None for k in RECOVERY_KEYS},
                "performance": {
                    "running": {
                        "running_tolerance": None,
                        "weekly_distance_km": None,
                        "weekly_intensity_moderate": None,
                        "weekly_intensity_vigorous": None,
                    },
                    "strength": {"weekly_volume_load": None},
                },
                "profileCandidates": [],
                "sessions": [],
            })

    return {"session": dump_session(api), "days": days}
