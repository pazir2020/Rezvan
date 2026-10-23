"""Backup / verify / restore / restore-test for PostgreSQL + the documents folder.
python -m app.ops backup | verify DIR | restore DIR --yes | restore-test DIR
Status: UNTESTED — needs PostgreSQL client tools (pg_dump, pg_restore) and a running server; none were available while authoring."""
import argparse
import datetime
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import zipfile

from . import config

KEEP = int(os.environ.get("HR_BACKUP_KEEP", "30"))


def _tool(name):
    exe = shutil.which(name) or shutil.which(name + ".exe")
    if not exe:
        pg = os.environ.get("HR_PG_BIN")                       # e.g. C:\Program Files\PostgreSQL\16\bin
        if pg and os.path.exists(os.path.join(pg, name + (".exe" if os.name == "nt" else ""))):
            exe = os.path.join(pg, name + (".exe" if os.name == "nt" else ""))
    if not exe:
        sys.exit("%s not found. Install the PostgreSQL client tools or set HR_PG_BIN to the PostgreSQL bin folder." % name)
    return exe


def _sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def backup() -> str:
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.join(config.BACKUP_DIR, stamp)
    os.makedirs(out, exist_ok=True)
    dump = os.path.join(out, "db.dump")
    subprocess.run([_tool("pg_dump"), "--format=custom", "--no-owner", "--file", dump, "--dbname", config.DATABASE_URL], check=True)
    zpath = os.path.join(out, "documents.zip")
    n = 0
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(config.DOC_ROOT):
            for f in files:
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, config.DOC_ROOT))
                n += 1
    manifest = {"created": stamp, "documents": n, "files": {"db.dump": _sha(dump), "documents.zip": _sha(zpath)}}
    json.dump(manifest, open(os.path.join(out, "manifest.json"), "w", encoding="utf-8"), indent=2)
    verify(out)                                                # a backup that cannot be verified is not a backup
    dirs = sorted(d for d in os.listdir(config.BACKUP_DIR) if re.match(r"^\d{8}-\d{6}$", d))
    for old in dirs[:-KEEP]:
        shutil.rmtree(os.path.join(config.BACKUP_DIR, old), ignore_errors=True)
    print("backup OK:", out)
    return out


def verify(folder: str):
    m = json.load(open(os.path.join(folder, "manifest.json"), encoding="utf-8"))
    for name, digest in m["files"].items():
        if _sha(os.path.join(folder, name)) != digest:
            sys.exit("VERIFY FAILED: checksum mismatch for " + name)
    with zipfile.ZipFile(os.path.join(folder, "documents.zip")) as z:
        if z.testzip() is not None:
            sys.exit("VERIFY FAILED: corrupt documents.zip")
    subprocess.run([_tool("pg_restore"), "--list", os.path.join(folder, "db.dump")], check=True, stdout=subprocess.DEVNULL)
    print("verify OK:", folder)


def restore(folder: str):
    verify(folder)
    print("taking a safety backup of the CURRENT state first ...")
    backup()
    subprocess.run([_tool("pg_restore"), "--clean", "--if-exists", "--no-owner", "--dbname", config.ADMIN_DATABASE_URL, os.path.join(folder, "db.dump")], check=True)
    if os.path.isdir(config.DOC_ROOT) and os.listdir(config.DOC_ROOT):
        shutil.move(config.DOC_ROOT, config.DOC_ROOT + ".before-restore-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
    os.makedirs(config.DOC_ROOT, exist_ok=True)
    with zipfile.ZipFile(os.path.join(folder, "documents.zip")) as z:
        z.extractall(config.DOC_ROOT)
    print("restore OK. Restart the server (stop + run).")


def restore_test(folder: str):
    """Restore into a throw-away database, compare row counts with the live one, drop it."""
    import psycopg
    from psycopg import sql
    verify(folder)
    m = re.match(r"^(postgres(?:ql)?://[^/]+)/([^?]+)(.*)$", config.ADMIN_DATABASE_URL)
    base, live, tail = m.group(1), m.group(2), m.group(3)
    # Never drop a fixed-name database: it might belong to an administrator.
    # The test database is unique per invocation and we delete only our own copy.
    test = live + "_hrtest_" + secrets.token_hex(5)
    with psycopg.connect(base + "/postgres" + tail, autocommit=True) as c:
        c.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(test)))
    try:
        subprocess.run([_tool("pg_restore"), "--no-owner", "--dbname", base + "/" + test + tail, os.path.join(folder, "db.dump")], check=True)
        def counts(url):
            with psycopg.connect(url) as c:
                return {t: c.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(t))).fetchone()[0]
                        for t in ("employees", "records", "users", "kv", "audit_log")}
        a, b = counts(base + "/" + test + tail), counts(base + "/" + live + tail)
        print("restored copy:", a, "| live now:", b)
        print("RESTORE TEST OK (counts are from the backup moment; the live DB may legitimately have more rows)")
    finally:
        with psycopg.connect(base + "/postgres" + tail, autocommit=True) as c:
            c.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(test)))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m app.ops")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("backup")
    for n in ("verify", "restore", "restore-test"):
        p = sub.add_parser(n); p.add_argument("folder")
        if n == "restore":
            p.add_argument("--yes", action="store_true")
    a = ap.parse_args(argv)
    if a.cmd == "backup":
        backup()
    elif a.cmd == "verify":
        verify(a.folder)
    elif a.cmd == "restore":
        if not a.yes:
            sys.exit("restore REPLACES the current database and documents. Re-run with --yes to confirm.")
        restore(a.folder)
    else:
        restore_test(a.folder)


if __name__ == "__main__":
    main()
