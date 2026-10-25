# Wind Forecast Intelligence

A React + FastAPI prototype for the Elexon wind forecast challenge.

## Features
- Reads actual wind generation (`FUELHH`) and forecasts (`WINDFOR`) from Elexon.
- Selects the latest forecast published before a configurable previous-day cutoff (default 11:00 UK time).
- Compares forecasts and actuals by delivery interval.
- Calculates MAE, RMSE, and forecast bias.
- Includes chart, interval table, date filters, Docker Compose, and backend tests.

## Run with Docker
```bash
docker compose up --build
```
Frontend: http://localhost:5173  
API docs: http://localhost:8000/docs

## Run locally
Backend:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Frontend in another terminal:
```bash
cd frontend
npm install
npm run dev
```

## API
`GET /api/analysis?start=2026-01-01&end=2026-01-31&cutoff_hour=11`

## Methodology
- Error = forecast - actual.
- MAE = mean absolute error.
- RMSE = square root of mean squared error.
- Bias = mean signed error; positive means overforecasting.
- Only intervals with both actuals and an eligible forecast are included.
- Percentage error is omitted because it is unstable when actual generation is zero or close to zero.

## Data sources
- Actuals: https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream
- Forecasts: https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream
- API host in this prototype: `https://data.elexon.co.uk/bmrs/api/v1`

## Important assumptions / limitations
The default selection rule uses the latest forecast published by 11:00 UK time on the day before delivery. The challenge does not define the exact cutoff, so confirm it with the client. Verify live Elexon query parameters, response schema, pagination, and January 2026 historical availability before relying on results. Missing data is not replaced with zero. This is a prototype, not a trading system.

## Deployment
Deploy `frontend` to Vercel and `backend` to a Python/container host. Configure `VITE_API_BASE_URL` in Vercel to the backend base URL (no trailing slash). The frontend Dockerfile is for local/container use; Vercel should build the frontend project from the `frontend` root.

## Tests
```bash
cd backend
pip install -r requirements.txt
pytest
```

## AI disclosure
AI assistance was used to scaffold and draft parts of this project. Review and understand the code before submitting, and disclose AI use as requested by the challenge.
