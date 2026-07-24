from playwright.sync_api import sync_playwright

result = {'rows': None}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        locale='id-ID',
        viewport={'width': 1280, 'height': 800},
        extra_http_headers={'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'}
    )
    page = context.new_page()
    try:
        page.goto('https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-broker/',
            wait_until='domcontentloaded', timeout=45000)
    except Exception as e:
        print('Nav (ok):', e)
    page.wait_for_timeout(12000)
    print('Title:', page.title())
    api_url = 'https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary?start=0&length=5&code=BBCA&date=2026-07-22'
    js_result = page.evaluate("""
        async () => {
            const r = await fetch('%s', {
                credentials: 'include',
                headers: {'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-broker/'}
            });
            if (!r.ok) return {error: r.status};
            return await r.json();
        }
    """ % api_url)
    print('Result:', str(js_result)[:600])
    if isinstance(js_result, dict) and 'data' in js_result:
        rows = js_result['data']
        result['rows'] = rows
        print('Rows:', len(rows))
        if rows: print('Keys:', list(rows[0].keys())); print('First:', rows[0])
    browser.close()
print('DONE rows:', len(result['rows']) if result['rows'] else 0)
