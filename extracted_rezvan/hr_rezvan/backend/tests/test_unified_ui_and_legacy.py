"""Regression guards for the approved light RTL shell and safe legacy UI repair.

These tests guard presence and trust boundaries; they do not replace a live LAN test.
"""
from pathlib import Path
import unittest

from app.core.validation import validate_economic_scenario

FRONTEND = Path(__file__).resolve().parents[2] / 'frontend'


class UnifiedFrontend(unittest.TestCase):
    def test_unified_assets_linked_and_present(self):
        html = (FRONTEND / 'dashboard-41.html').read_text(encoding='utf-8')
        self.assertIn('/static/rezvan-unified-theme.css', html)
        self.assertIn('/static/rezvan-live-dashboard.js', html)
        self.assertIn('id="rz-live-operations"', html)
        for file in ('rezvan-unified-theme.css', 'rezvan-live-dashboard.js'):
            self.assertGreater((FRONTEND / file).stat().st_size, 1000)

    def test_print_string_not_broken_by_resource_injection(self):
        from html.parser import HTMLParser
        class Collect(HTMLParser):
            def __init__(self):
                super().__init__(); self.in_script = False; self.visible=[]
            def handle_starttag(self, tag, attrs):
                if tag == 'script': self.in_script=True
            def handle_endtag(self, tag):
                if tag == 'script': self.in_script=False
            def handle_data(self, data):
                if not self.in_script: self.visible.append(data)
        p=Collect(); p.feed((FRONTEND / 'dashboard-41.html').read_text(encoding='utf-8'))
        text=' '.join(p.visible)
        self.assertNotIn('window.slipOpen=function', text)
        self.assertNotIn('window.slipListHTML=function', text)

    def test_display_metrics_do_not_invent_fallback_numbers(self):
        js=(FRONTEND / 'rezvan-live-dashboard.js').read_text(encoding='utf-8')
        self.assertIn("'—'", js)
        self.assertIn("canRead('view_salary')", js)
        self.assertIn("canRead('view_personnel')", js)
        self.assertIn('Do NOT rerun first-run', (Path(__file__).resolve().parents[2] / 'UNIFIED-UI-AND-FEATURE-AUDIT-FA.md').read_text(encoding='utf-8'))

    def test_economic_scenarios_validate_and_never_apply_salary(self):
        valid={'type':'hiring','title':'جذب فرضی','position':'فنی','salary':20000000,
               'results':{'monthlyLaborCost':23000000}}
        self.assertEqual(validate_economic_scenario(valid), [])
        self.assertTrue(validate_economic_scenario({**valid, 'results':{'monthlyLaborCost':float('inf')}}))
        self.assertTrue(validate_economic_scenario({**valid, 'results':{'unexpected':12}}))
        self.assertTrue(validate_economic_scenario({**valid, 'salary':-1}))

if __name__ == '__main__':unittest.main()
