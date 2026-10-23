"""Static guard for the layers that cannot run here (FastAPI/PostgreSQL): every module must parse and use no undefined names.
This is NOT a runtime test."""
import ast
import builtins
import glob
import os
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..", "app")


class StaticChecks(unittest.TestCase):
    def test_all_modules_parse_and_have_no_undefined_names(self):
        B = set(dir(builtins)) | {"__file__", "__name__"}
        problems = []
        for f in sorted(glob.glob(os.path.join(ROOT, "**", "*.py"), recursive=True)):
            tree = ast.parse(open(f, encoding="utf-8").read())
            defined = set()
            for n in ast.walk(tree):
                if isinstance(n, (ast.Import, ast.ImportFrom)):
                    for a in n.names:
                        defined.add((a.asname or a.name).split(".")[0])
                elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    defined.add(n.name)
                elif isinstance(n, ast.arg):
                    defined.add(n.arg)
                elif isinstance(n, ast.Name) and isinstance(n.ctx, (ast.Store, ast.Del)):
                    defined.add(n.id)
                elif isinstance(n, ast.ExceptHandler) and n.name:
                    defined.add(n.name)
            for n in ast.walk(tree):
                if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load) and n.id not in defined and n.id not in B:
                    problems.append("%s:%d %s" % (os.path.relpath(f, ROOT), n.lineno, n.id))
        self.assertEqual(problems, [])


if __name__ == "__main__":
    unittest.main()
