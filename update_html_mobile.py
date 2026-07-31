import glob
import os

for filepath in glob.glob('static/*.html'):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Add sidebar-overlay if not exists
    if 'id="sidebarOverlay"' not in content:
        content = content.replace('</aside>', '</aside>\n    <div class="sidebar-overlay" id="sidebarOverlay"></div>')
    
    # Add menuToggle if not exists
    if 'id="menuToggle"' not in content:
        theme_toggle_end = '</button>\n          </div>'
        replacement = '''</button>
            <button id="menuToggle" class="menu-toggle" aria-label="Toggle menu">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>\n          </div>'''
        content = content.replace(theme_toggle_end, replacement)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print('HTML files updated with mobile toggle and overlay.')
