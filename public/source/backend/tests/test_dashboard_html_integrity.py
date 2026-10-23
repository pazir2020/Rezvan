"""Guard against the payslip bug that made JavaScript visible as page text.

HTML parsing must be checked separately from JavaScript syntax checking:
placing literal ``</script>`` in a JS string terminates the HTML script element
*before* a JS parser has a chance to process the rest of its intended contents.
"""
from html.parser import HTMLParser
from pathlib import Path

HTML = (Path(__file__).resolve().parents[2] / 'frontend' / 'dashboard-41.html').read_text(encoding='utf-8')


class DashboardMarkup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_script = False
        self.visible_text = []
        self.inline_js = []
        self.script_sources = []
        self.script_chunks = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.in_script = True
            a = dict(attrs)
            if a.get('src'):
                self.script_sources.append(a['src'])
            self.script_chunks.append([])

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.script_chunks[-1].append(data)
        else:
            self.visible_text.append(data)


def test_payslip_script_is_inside_script_element_not_visible_page_text():
    parser = DashboardMarkup()
    parser.feed(HTML)
    visible = ' '.join(parser.visible_text)
    scripts = [''.join(chunks) for chunks in parser.script_chunks]
    assert 'window.slipOpen=function' not in visible
    assert 'window.slipListHTML=function' not in visible
    assert 'window.slipOpen=function' in '\n'.join(scripts)
    assert 'window.slipOpenAll=function' in '\n'.join(scripts)
    assert '<script src=' not in '\n'.join(scripts)  # never embed literal script tags in JS


def test_completion_module_loaded_once_in_document_not_inside_print_window():
    parser = DashboardMarkup()
    parser.feed(HTML)
    assert parser.script_sources.count('/static/hr-completion.js') == 1
    assert 'w.document.write(' in '\n'.join(''.join(chunks) for chunks in parser.script_chunks)
    assert "'+html+'</body></html>'" in HTML
