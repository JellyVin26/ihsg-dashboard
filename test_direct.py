import requests
from datetime import date, timedelta

IDX_URL = "https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary"
ticker = "BBCA"

for offset in range(7):
    d = date.today() - timedelta(days=offset)
    if d.weekday() >= 5:
        continue
    url = f"{IDX_URL}?start=0&length=9999&code={ticker}&date={d}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-broker/",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
    }
    try:
        r = requests.get(url, headers=headers, timeout=10)
        data = r.json()
        rows = data.get("data", [])
        total = data.get("recordsTotal", 0)
        print(f"{d}: HTTP {r.status_code} | total={total} | rows returned={len(rows)}")
        if rows:
            print(f"  First: {rows[0]}")
            break
    except Exception as e:
        print(f"{d}: Error - {e}")
