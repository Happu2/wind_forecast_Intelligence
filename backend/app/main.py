from __future__ import annotations

import asyncio
import math
import os
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

API_BASE = os.getenv("ELEXON_API_BASE", "https://data.elexon.co.uk/bmrs/api/v1").rstrip("/")
UK = ZoneInfo("Europe/London")

app = FastAPI(title="Wind Forecast Intelligence API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to the frontend origin in production.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=UK) if parsed.tzinfo is None else parsed
    except (ValueError, TypeError):
        return None


def to_number(value: Any) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


async def fetch_dataset(dataset: str, start: date, end: date) -> list[dict[str, Any]]:
    """Fetch records. Verify date parameters and pagination against current Elexon docs."""
    url = f"{API_BASE}/datasets/{dataset}/stream"
    params = {
    "publishDateTimeFrom": datetime.combine(
        start, time.min, tzinfo=UK
    ).astimezone(ZoneInfo("UTC")).isoformat(),
    "publishDateTimeTo": datetime.combine(
        end + timedelta(days=1), time.min, tzinfo=UK
    ).astimezone(ZoneInfo("UTC")).isoformat(),
}
    async with httpx.AsyncClient(timeout=httpx.Timeout(45, connect=10), follow_redirects=True) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("data", "results", "items"):
            if isinstance(payload.get(key), list):
                return [row for row in payload[key] if isinstance(row, dict)]
    raise ValueError(f"Unexpected response shape from {dataset}")


def normalize_actuals(rows: list[dict[str, Any]], start: date, end: date) -> dict[str, float]:
    actuals: dict[str, float] = {}
    for row in rows:
        fuel = str(row.get("fuelType", row.get("fueltype", ""))).upper()
        if fuel and fuel != "WIND":
            continue
        ts = parse_dt(row.get("startTime", row.get("start_time")))
        generation = to_number(row.get("generation"))
        if ts is None or generation is None:
            continue
        if start <= ts.astimezone(UK).date() <= end:
            actuals[ts.isoformat()] = generation
    return actuals


def normalize_forecasts(rows: list[dict[str, Any]], start: date, end: date) -> list[dict[str, Any]]:
    forecasts = []
    for row in rows:
        ts = parse_dt(row.get("startTime", row.get("start_time")))
        published = parse_dt(row.get("publishTime", row.get("publish_time")))
        generation = to_number(row.get("generation"))
        if ts is None or published is None or generation is None:
            continue
        if start <= ts.astimezone(UK).date() <= end:
            forecasts.append({"start": ts, "published": published, "generation": generation})
    return forecasts


def decision_cutoff(delivery: datetime, cutoff_hour: int) -> datetime:
    """Assumption: cutoff_hour UK local time on the previous calendar day."""
    previous_day = delivery.astimezone(UK).date() - timedelta(days=1)
    return datetime.combine(previous_day, time(hour=cutoff_hour), tzinfo=UK)


def analyze(actual_rows: list[dict[str, Any]], forecast_rows: list[dict[str, Any]],
            start: date, end: date, cutoff_hour: int = 11) -> dict[str, Any]:
    actuals = normalize_actuals(actual_rows, start, end)
    forecasts = normalize_forecasts(forecast_rows, start, end)
    forecasts_by_interval: dict[str, list[dict[str, Any]]] = {}
    for row in forecasts:
        forecasts_by_interval.setdefault(row["start"].isoformat(), []).append(row)

    matched = []
    missing_forecast = 0
    for interval_key, actual in sorted(actuals.items()):
        delivery = parse_dt(interval_key)
        if delivery is None:
            continue
        cutoff = decision_cutoff(delivery, cutoff_hour)
        eligible = [
            row for row in forecasts_by_interval.get(interval_key, [])
            if row["published"].astimezone(UK) <= cutoff
        ]
        if not eligible:
            missing_forecast += 1
            continue
        selected = max(eligible, key=lambda row: row["published"])
        error = selected["generation"] - actual
        matched.append({
            "startTime": delivery.isoformat(),
            "publishTime": selected["published"].isoformat(),
            "cutoffTime": cutoff.isoformat(),
            "forecast": round(selected["generation"], 3),
            "actual": round(actual, 3),
            "error": round(error, 3),
            "absoluteError": round(abs(error), 3),
        })

    errors = [row["error"] for row in matched]
    abs_errors = [abs(error) for error in errors]
    n = len(errors)
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "cutoffPolicy": f"Latest forecast published by {cutoff_hour:02d}:00 UK time on the previous calendar day",
        "summary": {
            "matchedIntervals": n,
            "actualIntervals": len(actuals),
            "forecastIntervals": len(forecasts_by_interval),
            "missingForecastIntervals": missing_forecast,
            "forecastIntervalsWithoutActual": sum(1 for key in forecasts_by_interval if key not in actuals),
            "mae": round(sum(abs_errors) / n, 3) if n else None,
            "rmse": round(math.sqrt(sum(error * error for error in errors) / n), 3) if n else None,
            "bias": round(sum(errors) / n, 3) if n else None,
            "overforecastIntervals": sum(error > 0 for error in errors),
            "underforecastIntervals": sum(error < 0 for error in errors),
            "exactIntervals": sum(error == 0 for error in errors),
        },
        "intervals": matched,
        "warnings": [
            "Confirm the forecast publication cutoff with the buyer before operational use.",
            "Verify Elexon historical coverage, response schema, date parameters, and pagination.",
            "Only matched intervals with an eligible forecast are included in accuracy metrics.",
        ],
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "wind-forecast-intelligence-api"}


@app.get("/api/analysis")
async def get_analysis(
    start: date = Query(default=date(2026, 1, 1)),
    end: date = Query(default=date(2026, 1, 31)),
    cutoff_hour: int = Query(default=11, ge=0, le=23),
):
    if end < start:
        raise HTTPException(status_code=400, detail="'end' must be on or after 'start'")
    if (end - start).days > 45:
        raise HTTPException(status_code=400, detail="Choose a date range of 46 days or less")
    try:
        actual_rows, forecast_rows = await asyncio.gather(
            fetch_dataset("FUELHH", start, end),
            fetch_dataset("WINDFOR", start, end),
        )
        return analyze(actual_rows, forecast_rows, start, end, cutoff_hour)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Elexon returned HTTP {exc.response.status_code}; verify API parameters and availability.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Unable to retrieve or parse Elexon data: {exc}") from exc
