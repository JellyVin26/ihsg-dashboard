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
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

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
        # Always fetch 5 years of data to have enough history for ML training and Risk
        hist = yf.download(
            symbol,
            period="5y",
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
    except Exception as e:
        raise HTTPException(502, f"Yahoo Finance error: {e}")

    if hist.empty:
        raise HTTPException(404, f"No data found for '{ticker}' (tried '{symbol}'). "
                                  "Check that it's a valid IDX ticker.")

    # Handle multi-level columns from newer yfinance versions
    if isinstance(hist.columns, pd.MultiIndex):
        hist.columns = hist.columns.droplevel(1)

    df = hist.copy()
    
    # --- 1. Compute Risk Level (Annualized Volatility & Drawdown over last 1 year) ---
    # ~252 trading days in a year
    df_1y = df.tail(252).copy()
    if len(df_1y) > 10:
        returns_1y = df_1y["Close"].pct_change().dropna()
        daily_vol = returns_1y.std()
        ann_vol = daily_vol * np.sqrt(252) * 100
        
        if ann_vol < 15:
            risk_level = "Low"
        elif ann_vol < 25:
            risk_level = "Medium"
        elif ann_vol < 40:
            risk_level = "High"
        else:
            risk_level = "Extreme"
    else:
        risk_level = "Unknown"
        ann_vol = 0

    # --- 2. Train ML Trend Predictor (Next Day) ---
    ml_prediction = "Unknown"
    ml_confidence = 0
    try:
        if len(df) > 100:
            # Feature Engineering
            df_ml = df.copy()
            df_ml['Ret_1d'] = df_ml['Close'].pct_change(1)
            df_ml['Ret_3d'] = df_ml['Close'].pct_change(3)
            df_ml['Ret_5d'] = df_ml['Close'].pct_change(5)
            df_ml['MA20'] = df_ml['Close'].rolling(20).mean()
            df_ml['MA50'] = df_ml['Close'].rolling(50).mean()
            df_ml['Dist_MA20'] = df_ml['Close'] / df_ml['MA20'] - 1
            df_ml['Dist_MA50'] = df_ml['Close'] / df_ml['MA50'] - 1
            
            # Target: 1 if next day's close > today's close, else 0
            df_ml['Target'] = (df_ml['Close'].shift(-1) > df_ml['Close']).astype(int)
            
            # Drop NaNs
            df_ml = df_ml.dropna()
            
            if len(df_ml) > 50:
                features = ['Ret_1d', 'Ret_3d', 'Ret_5d', 'Dist_MA20', 'Dist_MA50']
                X = df_ml[features]
                y = df_ml['Target']
                
                # We want to predict the *very next* day, so we train on everything except the last row
                X_train = X.iloc[:-1]
                y_train = y.iloc[:-1]
                X_latest = X.iloc[-1:] # Features of the latest trading day
                
                # Train a quick Random Forest
                rf = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42)
                rf.fit(X_train, y_train)
                
                # Predict next day
                pred = rf.predict(X_latest)[0]
                proba = rf.predict_proba(X_latest)[0]
                
                ml_prediction = "UP" if pred == 1 else "DOWN"
                ml_confidence = round(max(proba) * 100, 1)
    except Exception as e:
        print("ML Error:", e)

    # --- 3. Slice the data to the user's requested period for the chart ---
    # 1M=30, 3M=90, 6M=180, 1Y=365 calendar days roughly (trading days are fewer)
    period_mapping_days = {"1M": 22, "3M": 65, "6M": 130, "1Y": 252}
    trading_days = period_mapping_days.get(period, 65)
    
    sliced_df = df.tail(trading_days)
    
    close  = sliced_df["Close"].dropna()
    volume = sliced_df["Volume"].fillna(0)

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
        "risk_level":   risk_level,
        "ann_vol":      round(ann_vol, 2) if ann_vol else None,
        "ml_prediction": ml_prediction,
        "ml_confidence": ml_confidence,
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
