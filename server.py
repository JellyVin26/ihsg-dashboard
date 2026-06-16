"""
IDX Analyzer — FastAPI backend
Fetches real IHSG / IDX stock data from Yahoo Finance.

Run:
    pip install fastapi uvicorn yfinance
    python server.py
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import yfinance as yf
from datetime import datetime
import math

app = FastAPI(title="IDX Analyzer API", version="1.0.0")

# ── CORS — allow the frontend (any localhost port during dev) ──────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # lock down to your domain in production
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── Serve the frontend from /static (index.html, style.css, app.js) ────────
app.mount("/static", StaticFiles(directory="static", html=True), name="static")

# ── Ticker map: IDX symbol → Yahoo Finance symbol ─────────────────────────
TICKER_MAP = {
    "IHSG": "^JKSE",
    "BBCA": "BBCA.JK",
    "BBRI": "BBRI.JK",
    "TLKM": "TLKM.JK",
    "ASII": "ASII.JK",
    "GOTO": "GOTO.JK",
    "BMRI": "BMRI.JK",
    "UNVR": "UNVR.JK",
    "BRIS": "BRIS.JK",
    "ADMR": "ADMR.JK",
}

PERIOD_MAP = {
    "1M":  ("1mo",  "1d"),
    "3M":  ("3mo",  "1d"),
    "6M":  ("6mo",  "1d"),
    "1Y":  ("1y",   "1d"),
}

def yahoo_symbol(ticker: str) -> str:
    """Convert IDX ticker to Yahoo Finance symbol."""
    t = ticker.upper().strip()
    if t in TICKER_MAP:
        return TICKER_MAP[t]
    # Assume it's an IDX stock — append .JK
    return f"{t}.JK"

def safe_float(val) -> float | None:
    """Return float or None, never NaN/Inf."""
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None

# ── API routes ─────────────────────────────────────────────────────────────

@app.get("/api/prices/{ticker}")
def get_prices(ticker: str, period: str = "3M"):
    """
    Returns OHLCV price history for an IDX ticker.

    Query params:
      period: 1M | 3M | 6M | 1Y  (default 3M)

    Response:
      {
        ticker, yahoo_symbol, currency,
        prices: [float],
        dates: [str],
        volume: [int],
        latest: float,
        change: float,
        change_pct: float,
        fetched_at: str
      }
    """
    if period not in PERIOD_MAP:
        raise HTTPException(400, f"Invalid period '{period}'. Use: {list(PERIOD_MAP)}")

    yf_period, yf_interval = PERIOD_MAP[period]
    symbol = yahoo_symbol(ticker)

    try:
        hist = yf.download(
            symbol,
            period=yf_period,
            interval=yf_interval,
            progress=False,
            auto_adjust=True,
        )
    except Exception as e:
        raise HTTPException(502, f"Yahoo Finance error: {e}")

    if hist.empty:
        raise HTTPException(404, f"No data found for '{ticker}' (tried '{symbol}'). "
                                  "Check that it's a valid IDX ticker.")

    close  = hist["Close"].dropna()
    volume = hist["Volume"].fillna(0)

    prices = [safe_float(v) for v in close.values]
    dates  = [d.strftime("%d %b") for d in close.index]
    vols   = [int(v) for v in volume.reindex(close.index).fillna(0).values]

    latest     = prices[-1] if prices else None
    prev_close = prices[-2] if len(prices) > 1 else latest
    change     = round(latest - prev_close, 4) if (latest and prev_close) else None
    change_pct = round((change / prev_close) * 100, 2) if (change and prev_close) else None

    return {
        "ticker":       ticker.upper(),
        "yahoo_symbol": symbol,
        "currency":     "IDR" if ticker.upper() != "IHSG" else "points",
        "prices":       prices,
        "dates":        dates,
        "volume":       vols,
        "latest":       latest,
        "change":       change,
        "change_pct":   change_pct,
        "fetched_at":   datetime.utcnow().isoformat() + "Z",
    }


@app.get("/api/info/{ticker}")
def get_info(ticker: str):
    """
    Returns basic info / fundamentals for an IDX stock.
    Not available for the IHSG composite index.
    """
    if ticker.upper() == "IHSG":
        raise HTTPException(400, "Fundamental info not available for the IHSG index.")

    symbol = yahoo_symbol(ticker)
    try:
        info = yf.Ticker(symbol).info
    except Exception as e:
        raise HTTPException(502, f"Yahoo Finance error: {e}")

    wanted = [
        "longName", "sector", "industry", "marketCap",
        "trailingPE", "forwardPE", "priceToBook",
        "dividendYield", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
        "averageVolume", "currency",
    ]
    return {k: info.get(k) for k in wanted}


@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat() + "Z"}


# ── Entrypoint ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
