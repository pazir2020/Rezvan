"""Server-side login throttling (the client-side 5-strikes/30s counter is not a real limit).
Pure function over recent failure timestamps (epoch seconds). Status: tested logic, no DB."""
from typing import Iterable

WINDOW = 15 * 60       # look at failures in the last 15 minutes
FREE_ATTEMPTS = 4      # 5th consecutive failure starts the delay
BASE_DELAY = 30        # seconds
MAX_DELAY = 15 * 60


def retry_after(failures: Iterable[float], now: float) -> int:
    """Seconds the caller must wait before another attempt (0 = allowed). Delay doubles per extra failure."""
    recent = sorted(t for t in failures if now - t <= WINDOW)
    n = len(recent)
    if n <= FREE_ATTEMPTS:
        return 0
    delay = min(BASE_DELAY * (2 ** (n - FREE_ATTEMPTS - 1)), MAX_DELAY)
    return max(0, int(recent[-1] + delay - now))
