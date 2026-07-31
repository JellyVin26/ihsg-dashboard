import re
import os

style_path = 'static/style.css'
with open(style_path, 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Update Dark Theme Tokens
dark_tokens = """:root,
[data-theme="dark"] {
  --color-bg:          #09090b;
  --color-bg-subtle:   #18181b;
  --color-surface:     rgba(24, 24, 27, 0.7);
  --color-surface-solid: #18181b;
  --color-surface-2:   #27272a;
  --color-surface-hover: #27272a;
  --color-border:      rgba(255, 255, 255, 0.08);
  --color-border-md:   rgba(255, 255, 255, 0.12);
  --color-border-focus: #CFF008;
  --color-text-1:      #fafafa;
  --color-text-2:      #a1a1aa;
  --color-text-3:      #71717a;
  --color-accent:      #CFF008;
  --color-accent-dim:  rgba(207, 240, 8, 0.12);
  --color-accent-glow: rgba(207, 240, 8, 0.3);
  --color-green:       #CFF008;
  --color-green-dim:   rgba(207, 240, 8, 0.12);
  --color-red:         #ef4444;
  --color-red-dim:     rgba(239, 68, 68, 0.12);
  --color-amber:       #fbbf24;
  --color-amber-dim:   rgba(251, 191, 36, 0.12);
  --gradient-header:   linear-gradient(135deg, rgba(9,9,11,0.9) 0%, rgba(24,24,27,0.9) 50%, rgba(9,9,11,0.9) 100%);
  --gradient-accent:   linear-gradient(135deg, #CFF008, #e2f554);
  --shadow-card:       0 8px 32px 0 rgba(0, 0, 0, 0.37);
  --shadow-hover:      0 12px 40px rgba(0,0,0,0.5);
  --shadow-glow:       0 0 20px rgba(207, 240, 8, 0.25);
  --glass-blur:        blur(12px);
  --chart-grid:        rgba(255, 255, 255, 0.04);
  --chart-tick:        #71717a;
  --radius-sm:  8px;
  --radius-md:  16px;
  --radius-lg:  24px;
  --radius-xl:  32px;
  --font:       'Urbanist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono:  'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  --transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}"""

css = re.sub(r':root,\s*\[data-theme="dark"\]\s*\{[^}]+\}', dark_tokens, css, flags=re.MULTILINE)

# 2. Update Light Theme Tokens
light_tokens = """[data-theme="light"] {
  --color-bg:          #f8fafc;
  --color-bg-subtle:   #f1f5f9;
  --color-surface:     rgba(255, 255, 255, 0.8);
  --color-surface-solid: #ffffff;
  --color-surface-2:   #e2e8f0;
  --color-surface-hover: #f1f5f9;
  --color-border:      rgba(0, 0, 0, 0.06);
  --color-border-md:   rgba(0, 0, 0, 0.12);
  --color-border-focus: #8a9f00;
  --color-text-1:      #0f172a;
  --color-text-2:      #475569;
  --color-text-3:      #64748b;
  --color-accent:      #8a9f00;
  --color-accent-dim:  rgba(138, 159, 0, 0.1);
  --color-accent-glow: rgba(138, 159, 0, 0.2);
  --color-green:       #8a9f00;
  --color-green-dim:   rgba(138, 159, 0, 0.1);
  --color-red:         #dc2626;
  --color-red-dim:     rgba(220, 38, 38, 0.08);
  --color-amber:       #d97706;
  --color-amber-dim:   rgba(217, 119, 6, 0.08);
  --gradient-header:   linear-gradient(135deg, rgba(248,250,252,0.9) 0%, rgba(255,255,255,0.9) 50%, rgba(248,250,252,0.9) 100%);
  --gradient-accent:   linear-gradient(135deg, #8a9f00, #a3be05);
  --shadow-card:       0 8px 32px 0 rgba(31, 38, 135, 0.07);
  --shadow-hover:      0 12px 40px rgba(31, 38, 135, 0.12);
  --shadow-glow:       0 0 15px rgba(138, 159, 0, 0.15);
  --glass-blur:        blur(12px);
  --chart-grid:        rgba(0, 0, 0, 0.05);
  --chart-tick:        #64748b;
}"""
css = re.sub(r'\[data-theme="light"\]\s*\{[^}]+\}', light_tokens, css, flags=re.MULTILINE)

# 3. Enhance `.card` base styling for Bento/Glass
card_style = """.card {
  background: var(--color-surface-solid);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  box-shadow: var(--shadow-card);
  transition: all var(--transition);
  position: relative;
  overflow: hidden;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
  border-color: var(--color-border-md);
}
.card::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  opacity: 0;
  transition: opacity var(--transition);
}
.card:hover::before { opacity: 1; }
.card--glass {
  background: var(--color-surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}"""
css = re.sub(r'\.card\s*\{[^}]+\}\s*\.card--glass\s*\{[^}]+\}', card_style, css, flags=re.MULTILINE)

# 4. Enhance `.metrics-grid` to Bento-box style
metrics_grid_style = """.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1px;
  background: var(--color-border);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--color-surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--color-border);
}
.app-header::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, rgba(59,130,246,0.03) 0%, transparent 100%);
  pointer-events: none;
}
.metric {
  background: var(--color-surface);
  backdrop-filter: var(--glass-blur);
  border: none;
  border-radius: 0;
  padding: 16px;
  box-shadow: none;
  transition: all var(--transition);
  position: relative;
  overflow: hidden;
}"""
css = re.sub(r'\.metrics-grid\s*\{[^}]+\}\n\.app-header\s*\{[^}]+\}\n\.app-header::before\s*\{[^}]+\}\n\.metric\s*\{[^}]+\}', metrics_grid_style, css, flags=re.MULTILINE)

# 5. Enhance `.signal-grid` to Bento-box style
signal_grid_style = """.signal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1px;
  background: var(--color-border);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 20px;
}
.signal-card {
  background: var(--color-surface);
  padding: 16px;
  border: none;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  transition: all var(--transition);
}
.signal-card:hover {
  background: var(--color-surface-hover);
}"""
css = re.sub(r'\.signal-grid\s*\{[^}]+\}\n\.signal-card\s*\{[^}]+\}', signal_grid_style, css, flags=re.MULTILINE)

# Also ensure body transition is smooth
css = css.replace("transition: background var(--transition), color var(--transition);", "transition: background 0.5s ease, color 0.5s ease;")

with open(style_path, 'w', encoding='utf-8') as f:
    f.write(css)

print("CSS updated successfully.")
