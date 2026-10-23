"""Validate/copy the canonical integrated Rezvan LAN dashboard without losing add-ons.

Previously this script regenerated the HTML from dashboard-41.original.html and
accidentally DROPPED newer standalone modules and their entrypoints. That
operation is intentionally disabled. The current dashboard-41.html is the
canonical integrated frontend; use --check or --output for a verified copy.

Examples:
  python frontend/build_frontend.py --check
  python frontend/build_frontend.py --output /tmp/dashboard-41.html
"""
from __future__ import annotations
import argparse
import hashlib
from html.parser import HTMLParser
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
HTML = HERE / 'dashboard-41.html'
REQUIRED = (
 'hr-api-shim', 'rzContractsRefresh', 'oven-tracking.js',
 'team-performance.js', 'team-hours.js', 'kpi-team.js',
 'individual-kpi.js', 'hr-development.js', 'hr-approvals.js',
 'hr-operations.js', 'hr-completion.js', 'صدور و چاپ فیش حقوقی',
 'rezvan-unified-theme.css', 'rezvan-live-dashboard.js', 'rz-live-operations',
)


class _ScriptBoundaryValidator(HTMLParser):
    """Validate HTML boundaries, not only JS syntax; a raw </script> ends an inline script."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.inside_script = False
        self.visible_chunks = []
        self.inline_scripts = []
        self.external_scripts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.inside_script = True
            attr = dict(attrs)
            if attr.get('src'):
                self.external_scripts.append(attr['src'])
            else:
                self.inline_scripts.append([])

    def handle_endtag(self, tag):
        if tag == 'script':
            self.inside_script = False

    def handle_data(self, content):
        if self.inside_script and self.inline_scripts:
            self.inline_scripts[-1].append(content)
        elif not self.inside_script:
            self.visible_chunks.append(content)


def verify() -> dict:
    page=HTML.read_text(encoding='utf-8')
    markup=_ScriptBoundaryValidator()
    markup.feed(page)
    visible=' '.join(markup.visible_chunks)
    if 'window.slipOpen=function' in visible or 'window.slipListHTML=function' in visible:
        raise RuntimeError('JavaScript leaked into page text: malformed <script> boundaries in payslip section')
    if markup.external_scripts.count('/static/hr-completion.js') != 1:
        raise RuntimeError('HR completion module must be loaded once from the document, not a print string')
    if '<script src=' in '\n'.join(''.join(chunk) for chunk in markup.inline_scripts):
        raise RuntimeError('A raw <script src> tag was embedded into JavaScript source')
    missing=[mark for mark in REQUIRED if mark not in page]
    if missing:raise RuntimeError('Integrated modules missing: '+', '.join(missing))
    for asset in re.findall(r'<(?:script|link)\b[^>]+(?:src|href)=["\'](/static/[^"\']+)',page):
        if not (HERE / asset.removeprefix('/static/')).is_file():
            missing.append(asset)
    if missing:raise RuntimeError('Static dependencies not found: '+', '.join(missing))
    if 'window.__hrServerBoot();' not in page:raise RuntimeError('LAN API boot missing')
    return {'bytes':HTML.stat().st_size,'sha256':hashlib.sha256(HTML.read_bytes()).hexdigest(),
            'modules_checked':len(REQUIRED)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='verify the canonical integrated dashboard')
    parser.add_argument('--output',type=Path,help='copy validated dashboard without overwriting integrated source')
    opts=parser.parse_args()
    info=verify()
    if opts.output:
        if opts.output.resolve()==HTML.resolve():
            raise SystemExit('The integrated source must not be overwritten by a rebuild.')
        opts.output.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(HTML,opts.output)
        print('verified copy:',opts.output)
    print('frontend verified:',info)

if __name__=='__main__':main()
