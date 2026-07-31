import re

def update_screener():
    with open('static/screener.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Update Filters Sidebar
    html = html.replace(
        '<aside class="screener-filters" style="padding-top: 6px;">',
        '<aside class="screener-filters card card--glass" style="padding: 20px; height: fit-content;">'
    )
    
    # Update Results Section
    html = html.replace(
        '<section class="screener-results">',
        '<section class="screener-results card card--glass" style="padding: 0; display: flex; flex-direction: column; overflow: hidden;">'
    )
    html = html.replace(
        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; background: var(--color-bg); z-index: 10; padding-bottom: 8px;" class="screener-desktop-toolbar">',
        '<div style="display: flex; justify-content: space-between; align-items: center; background: transparent; z-index: 10; padding: 20px 20px 16px 20px; border-bottom: 1px solid var(--color-border);" class="screener-desktop-toolbar">'
    )
    
    # Grid Row headers
    html = html.replace(
        'style="padding: 12px 16px; border-bottom: 1px solid var(--color-border); font-size: 11px; font-weight: 700; color: var(--color-text-3); text-transform: uppercase; letter-spacing: 0.05em;"',
        'style="padding: 16px 20px; border-bottom: 1px solid var(--color-border); font-size: 11px; font-weight: 800; color: var(--color-text-3); text-transform: uppercase; letter-spacing: 0.05em; background: rgba(0,0,0,0.1);"'
    )
    
    # Results body
    html = html.replace(
        'style="overflow-y: auto; flex: 1; padding-top: 8px; padding-right: 8px; padding-left: 2px; padding-bottom: 24px; display: flex; flex-direction: column; gap: 8px;"',
        'style="overflow-y: auto; flex: 1; padding: 12px 20px 24px 20px; display: flex; flex-direction: column; gap: 8px;"'
    )
    
    # Insights cards to glass
    html = html.replace('class="card"', 'class="card card--glass"')
    
    with open('static/screener.html', 'w', encoding='utf-8') as f:
        f.write(html)

def update_picks():
    with open('static/picks.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Convert header to a card glass style if needed, or leave as is but improve metrics
    html = html.replace(
        '<div class="pick-metric-card">',
        '<div class="pick-metric-card card card--glass" style="padding: 16px; border-radius: var(--radius-lg); flex: 1;">'
    )
    
    # Make pick-card glass (the JS generates the actual cards, so we need to update app.js or picks.html skeleton)
    # The skeleton is in HTML
    html = html.replace(
        '<div class="pick-card skeleton"',
        '<div class="pick-card card card--glass skeleton"'
    )
    
    with open('static/picks.html', 'w', encoding='utf-8') as f:
        f.write(html)

def update_app_js_pick_card():
    with open('static/app.js', 'r', encoding='utf-8') as f:
        js = f.read()
    
    # In renderStockPicks, the JS creates pick-card elements
    # `const card = document.createElement('div'); card.className = 'pick-card animate-in';`
    js = js.replace(
        "card.className = 'pick-card animate-in';",
        "card.className = 'pick-card card card--glass animate-in';"
    )
    
    # Improve picks-header-metrics to flex
    # Actually that's in CSS, let's see if we can just inject some CSS
    css_injection = """
/* Taste improvements for Picks & Screener */
.pick-metric-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
}
.pick-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
}
.pick-card:hover {
  border-color: var(--color-accent);
}
.screener-grid-row {
  transition: all var(--transition);
}
.screener-item {
  border-radius: var(--radius-sm);
  padding: 12px 20px;
  transition: all var(--transition);
}
.screener-item:hover {
  background: var(--color-surface-hover);
  transform: translateX(4px);
}
"""
    with open('static/style.css', 'a', encoding='utf-8') as f:
        f.write(css_injection)
        
    with open('static/app.js', 'w', encoding='utf-8') as f:
        f.write(js)

if __name__ == "__main__":
    update_screener()
    update_picks()
    update_app_js_pick_card()
    print("Done")
