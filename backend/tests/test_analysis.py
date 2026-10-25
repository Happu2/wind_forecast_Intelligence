from datetime import date
from app.main import analyze, decision_cutoff, parse_dt


def test_cutoff_is_previous_day():
    delivery = parse_dt("2026-01-15T10:00:00Z")
    cutoff = decision_cutoff(delivery, 11)
    assert cutoff.hour == 11
    assert cutoff.date().isoformat() == "2026-01-14"


def test_latest_eligible_forecast_and_metrics():
    actuals = [
        {"fuelType": "WIND", "startTime": "2026-01-15T10:00:00Z", "generation": 3600},
        {"fuelType": "WIND", "startTime": "2026-01-15T10:30:00Z", "generation": 4000},
        {"fuelType": "GAS", "startTime": "2026-01-15T10:00:00Z", "generation": 9999},
    ]
    forecasts = [
        {"startTime": "2026-01-15T10:00:00Z", "publishTime": "2026-01-13T10:00:00Z", "generation": 4500},
        {"startTime": "2026-01-15T10:00:00Z", "publishTime": "2026-01-14T08:00:00Z", "generation": 4000},
        {"startTime": "2026-01-15T10:00:00Z", "publishTime": "2026-01-14T12:00:00Z", "generation": 9999},
        {"startTime": "2026-01-15T10:30:00Z", "publishTime": "2026-01-14T08:00:00Z", "generation": 3900},
    ]
    result = analyze(actuals, forecasts, date(2026, 1, 1), date(2026, 1, 31), 11)
    assert result["summary"]["matchedIntervals"] == 2
    assert result["intervals"][0]["forecast"] == 4000
    assert result["intervals"][0]["error"] == 400
    assert result["summary"]["mae"] == 250
    assert result["summary"]["bias"] == 250


def test_empty_data_returns_null_metrics():
    result = analyze([], [], date(2026, 1, 1), date(2026, 1, 31))
    assert result["summary"]["matchedIntervals"] == 0
    assert result["summary"]["mae"] is None
