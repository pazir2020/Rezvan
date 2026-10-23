"""Minimal pytest compatibility shim for environments running standard library unittest."""

class _RaisesContext:
    def __init__(self, exc):
        self.exc = exc
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            raise AssertionError(f"Expected {self.exc} but no exception was raised.")
        return issubclass(exc_type, self.exc)

def raises(exc):
    return _RaisesContext(exc)

class mark:
    @staticmethod
    def skip(reason=""):
        def decorator(f):
            return f
        return decorator
