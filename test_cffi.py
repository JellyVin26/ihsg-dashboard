import datetime
from curl_cffi import requests

date = datetime.datetime.now().strftime('%Y-%m-%d')
url = f"https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary?start=0&length=9999&code=BBCA&date={date}"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-broker/",
}
print("Fetching...")
try:
    r = requests.get(url, headers=headers, impersonate="chrome")
    print(r.status_code)
    print(r.text[:200])
except Exception as e:
    print(e)
