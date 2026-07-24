
import os

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
html_files = ['index.html', 'search.html', 'picks.html', 'analysis.html']

for file in html_files:
    path = os.path.join(static_dir, file)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        content = content.replace(r'\n', '\n')
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
print('Done')

