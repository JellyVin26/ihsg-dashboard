
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(base_dir, 'static')

html_files = ['index.html', 'search.html', 'picks.html', 'analysis.html']
loader_html = '''
  <div id="page-loader" class="page-loader">
    <div class="spinner"></div>
  </div>
  <div class="ambient-bg">
    <div class="ambient-orb orb-1"></div>
    <div class="ambient-orb orb-2"></div>
    <div class="ambient-orb orb-3"></div>
  </div>
'''

for file in html_files:
    path = os.path.join(static_dir, file)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        content = content.replace('family=Urbanist:wght@400;500;600;700;800&', 'family=Inter:wght@400;500;600;700;800&')
        content = content.replace('family=Urbanist:wght@400;500;600;700;800&amp;', 'family=Inter:wght@400;500;600;700;800&amp;')
        
        if 'class="page-loader"' not in content:
            content = content.replace('<body>', '<body>\\n' + loader_html)
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

css_path = os.path.join(static_dir, 'style.css')
css_overrides = '''
/* ========================================================
   NEON GLASSMORPHISM OVERHAUL (Appended overrides)
   ======================================================== */
:root, [data-theme="dark"] {
  --color-bg: #050508 !important;
  --color-bg-subtle: rgba(255, 255, 255, 0.02) !important;
  --color-surface: rgba(20, 20, 25, 0.6) !important;
  --color-surface-solid: #0f0f13 !important;
  --color-surface-2: rgba(255, 255, 255, 0.05) !important;
  --color-border: rgba(255, 255, 255, 0.08) !important;
  --color-border-md: rgba(255, 255, 255, 0.15) !important;
  --color-accent: #00f0ff !important;
  --color-accent-dim: rgba(0, 240, 255, 0.15) !important;
  --color-accent-glow: rgba(0, 240, 255, 0.3) !important;
  --color-green: #00ff88 !important;
  --color-red: #ff3366 !important;
  --gradient-accent: linear-gradient(135deg, #00f0ff, #b026ff) !important;
  --font: 'Inter', -apple-system, sans-serif !important;
  --shadow-hover: 0 10px 40px rgba(0, 240, 255, 0.1) !important;
  --shadow-card: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
  --glass-blur: blur(24px) !important;
}

body {
  font-family: var(--font) !important;
  background-color: var(--color-bg) !important;
  color: var(--color-text-1) !important;
}

/* Ambient Background */
.ambient-bg {
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.ambient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.4;
  animation: floatOrb 20s infinite alternate ease-in-out;
}
.orb-1 { width: 40vw; height: 40vw; background: rgba(0, 240, 255, 0.15); top: -10vw; left: -10vw; }
.orb-2 { width: 30vw; height: 30vw; background: rgba(176, 38, 255, 0.15); bottom: -10vw; right: -5vw; animation-delay: -5s; }
.orb-3 { width: 25vw; height: 25vw; background: rgba(0, 255, 136, 0.1); top: 40vh; left: 40vw; animation-delay: -10s; }

@keyframes floatOrb {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(5vw, 5vh) scale(1.1); }
}

/* Glassmorphic Cards */
.card, .pick-card, .metric, .sidebar, .app-header {
  background: var(--color-surface) !important;
  backdrop-filter: var(--glass-blur) !important;
  -webkit-backdrop-filter: var(--glass-blur) !important;
  border: 1px solid var(--color-border) !important;
  box-shadow: var(--shadow-card) !important;
}
.card:hover, .pick-card:hover {
  border-color: var(--color-accent) !important;
  box-shadow: var(--shadow-hover) !important;
  transform: translateY(-4px) !important;
}

/* Sidebar Specifics */
.sidebar {
  background: rgba(10, 10, 15, 0.7) !important;
  border-right: 1px solid var(--color-border) !important;
}

/* Page Loader */
.page-loader {
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  background: #050508;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: opacity 0.5s ease, visibility 0.5s ease;
}
.page-loader.hidden {
  opacity: 0;
  visibility: hidden;
}
.spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(0, 240, 255, 0.2);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Staggered Animations for Elements */
.main-wrapper > * {
  animation: fadeInUpStagger 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
  transform: translateY(20px);
}
.main-wrapper > *:nth-child(1) { animation-delay: 0.1s; }
.main-wrapper > *:nth-child(2) { animation-delay: 0.2s; }
.main-wrapper > *:nth-child(3) { animation-delay: 0.3s; }
.main-wrapper > *:nth-child(4) { animation-delay: 0.4s; }
.main-wrapper > *:nth-child(5) { animation-delay: 0.5s; }
.main-wrapper > *:nth-child(6) { animation-delay: 0.6s; }
.main-wrapper > *:nth-child(7) { animation-delay: 0.7s; }
.main-wrapper > *:nth-child(8) { animation-delay: 0.8s; }

.metrics-grid .metric {
  animation: scaleInStagger 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
  transform: scale(0.95);
}
.metrics-grid .metric:nth-child(1) { animation-delay: 0.2s; }
.metrics-grid .metric:nth-child(2) { animation-delay: 0.3s; }
.metrics-grid .metric:nth-child(3) { animation-delay: 0.4s; }
.metrics-grid .metric:nth-child(4) { animation-delay: 0.5s; }
.metrics-grid .metric:nth-child(5) { animation-delay: 0.6s; }

.picks-grid .pick-card {
  animation: fadeInUpStagger 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
  transform: translateY(30px);
}
.picks-grid .pick-card:nth-child(1) { animation-delay: 0.2s; }
.picks-grid .pick-card:nth-child(2) { animation-delay: 0.3s; }
.picks-grid .pick-card:nth-child(3) { animation-delay: 0.4s; }
.picks-grid .pick-card:nth-child(4) { animation-delay: 0.5s; }

@keyframes fadeInUpStagger {
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scaleInStagger {
  to { opacity: 1; transform: scale(1); }
}

/* Accent texts */
.price-big {
  background: var(--gradient-accent) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}

/* Light Theme Adjustments */
[data-theme="light"] {
  --color-bg: #f8f9fa !important;
  --color-surface: rgba(255, 255, 255, 0.7) !important;
  --color-border: rgba(0, 0, 0, 0.05) !important;
  --color-text-1: #111 !important;
  --color-accent: #0070f3 !important;
}
[data-theme="light"] .ambient-orb { opacity: 0.2; }
'''

if os.path.exists(css_path):
    with open(css_path, 'r', encoding='utf-8') as f:
        current_css = f.read()
    if 'NEON GLASSMORPHISM OVERHAUL' not in current_css:
        with open(css_path, 'a', encoding='utf-8') as f:
            f.write('\\n' + css_overrides)

js_path = os.path.join(static_dir, 'app.js')
js_add = '''
// UI Overhaul: Page Loader
window.addEventListener('load', () => {
  const loader = document.getElementById('page-loader');
  if (loader) {
    setTimeout(() => {
      loader.classList.add('hidden');
    }, 400);
  }
});
'''
if os.path.exists(js_path):
    with open(js_path, 'r', encoding='utf-8') as f:
        current_js = f.read()
    if 'page-loader' not in current_js:
        with open(js_path, 'a', encoding='utf-8') as f:
            f.write('\\n' + js_add)

print('Done')

