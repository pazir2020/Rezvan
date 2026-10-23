"""PostgreSQL connection pool (psycopg 3). UNTESTED: no PostgreSQL in the authoring environment."""
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config

pool = ConnectionPool(config.DATABASE_URL, kwargs={"row_factory": dict_row}, open=False, min_size=1, max_size=10)


def open_pool():
    pool.open()


def close_pool():
    pool.close()


@contextmanager
def tx():
    """One transaction per unit of work: commit on success, roll back on any exception."""
    with pool.connection() as conn:
        yield conn
