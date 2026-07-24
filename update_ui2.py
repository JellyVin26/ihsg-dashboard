
import os
import re

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
        
        if 'class="page-loader"' not in content:
            content = re.sub(r'(<body[^>]*>)', r'\1\\n' + loader_html, content)
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
print('Done')

