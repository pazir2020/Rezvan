"""Command line: python -m app.cli <command>   (see README). UNTESTED against PostgreSQL (none available while authoring)."""
import argparse
import getpass
import json
import os
import re
import secrets
import sys

from . import config
from .core.passwords import hash_password
from .specs import ALL_PERMISSIONS, ROLE_LABELS, ROLE_PERMS, SENSITIVE_PERMISSIONS

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _cat(p):
    return "view" if p.startswith("view_") else "delete" if p.startswith(("delete_", "purge")) else "approve" if p.startswith("approve_") else "edit" if p.startswith(("write_", "edit_")) else "manage"


def seed_reference_data(conn):
    """roles, permissions and role grants copied from the system's ROLE_PERMS (idempotent)."""
    for rid, perms in ROLE_PERMS.items():
        conn.execute("INSERT INTO roles (id, label, all_permissions) VALUES (%s,%s,%s) ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, all_permissions=EXCLUDED.all_permissions",
                     (rid, ROLE_LABELS.get(rid, rid), "*" in perms))
    for p in ALL_PERMISSIONS:
        conn.execute("INSERT INTO permissions (code, category, sensitive) VALUES (%s,%s,%s) ON CONFLICT (code) DO NOTHING", (p, _cat(p), p in SENSITIVE_PERMISSIONS))
    for rid, perms in ROLE_PERMS.items():
        for p in perms:
            if p != "*":
                conn.execute("INSERT INTO role_permissions (role_id, permission_code) VALUES (%s,%s) ON CONFLICT DO NOTHING", (rid, p))


def cmd_gen_env(a):
    path = os.path.join(ROOT, "backend", ".env")
    if os.path.exists(path):
        print(".env already exists:", path)
        return 0
    app_pw, secret = secrets.token_urlsafe(18), secrets.token_urlsafe(48)
    example = open(os.path.join(ROOT, "backend", ".env.example"), encoding="utf-8").read()
    example = example.replace("CHANGE_ME_APP_PASSWORD", app_pw).replace("CHANGE_ME_SECRET_KEY", secret)
    open(path, "w", encoding="utf-8").write(example)
    print("created", path, "- set HR_ADMIN_DATABASE_URL (PostgreSQL superuser) before init-db")
    return 0


def cmd_init_db(a):
    import psycopg
    from psycopg import sql
    from psycopg.rows import dict_row
    url = config.ADMIN_DATABASE_URL
    m = re.match(r"^(postgres(?:ql)?://[^/]+)/([^?]+)(.*)$", url)
    if a.create_db and m:
        with psycopg.connect(m.group(1) + "/postgres" + m.group(3), autocommit=True) as c:
            if not c.execute("SELECT 1 FROM pg_database WHERE datname = %s", (m.group(2),)).fetchone():
                c.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(m.group(2))))
                print("database created:", m.group(2))
    app_url = config.DATABASE_URL
    am = re.match(r"^postgres(?:ql)?://([^:]+):([^@]*)@", app_url)
    app_role, app_pw = (am.group(1), am.group(2)) if am else ("hr_app", "")
    with psycopg.connect(url, row_factory=dict_row) as conn:
        conn.execute(open(os.path.join(ROOT, "db", "schema.sql"), encoding="utf-8").read())
        if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (app_role,)).fetchone():
            conn.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(sql.Identifier(app_role), sql.Literal(app_pw)))
        db_name = conn.execute("SELECT current_database() AS d").fetchone()["d"]
        conn.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(sql.Identifier(db_name), sql.Identifier(app_role)))
        for stmt in (
            "GRANT USAGE ON SCHEMA public TO {r}",
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {r}",
            "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {r}",
            "REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM {r}",          # append-only for the application
            "REVOKE UPDATE, DELETE, TRUNCATE ON hr_team_registry_events,hr_individual_kpi_events FROM {r}",
            "REVOKE UPDATE, DELETE, TRUNCATE ON hr_completion_events FROM {r}",
        ):
            conn.execute(sql.SQL(stmt).format(r=sql.Identifier(app_role)))
        seed_reference_data(conn)
        conn.execute("INSERT INTO meta (key, value) VALUES ('schema_version', '3') ON CONFLICT (key) DO NOTHING")
    print("database initialised; application role:", app_role)
    return 0


def cmd_upgrade_safe(a):
    """Additive upgrade ONLY: no deletes, data replacement, or legacy migration.

    Run only after a verified backup; requires the PostgreSQL admin connection.
    """
    import psycopg
    from psycopg import sql
    with psycopg.connect(config.ADMIN_DATABASE_URL) as conn:
        found=conn.execute("SELECT to_regclass('public.hr_team_kpi_periods')").fetchone()[0]
        if found is None:
            raise RuntimeError('Existing KPI schema not found; run normal first-run on a NEW database instead')
        conn.execute(open(os.path.join(ROOT, 'db', 'upgrade-team-kpi.sql'), encoding='utf-8').read())
        conn.execute(open(os.path.join(ROOT, 'db', 'upgrade-hr-completion.sql'), encoding='utf-8').read())
        approle=re.match(r'^postgres(?:ql)?://([^:]+):',config.DATABASE_URL)
        if not approle:
            raise RuntimeError('HR_DATABASE_URL role could not be verified')
        role=sql.Identifier(approle.group(1))
        # Grant the application access ONLY to the new objects it must own.
        for table in ('hr_team_memberships','hr_team_supervisors','hr_team_kpi_weights',
                      'hr_team_registry_events','hr_individual_kpi_profiles','hr_individual_kpi_periods',
                      'hr_individual_kpi_events'):
            conn.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON {} TO {}').format(sql.Identifier(table),role))
        for table in ('hr_payroll_review_packets','hr_payslip_issue_register','hr_payslip_pdf_archive',
                      'hr_kpi_grievances','hr_team_transfer_reviews','hr_completion_events'):
            conn.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON {} TO {}').format(sql.Identifier(table),role))
        for seq in ('hr_team_memberships_id_seq','hr_team_supervisors_id_seq',
                    'hr_team_registry_events_id_seq','hr_individual_kpi_periods_id_seq','hr_individual_kpi_events_id_seq'):
            conn.execute(sql.SQL('GRANT USAGE,SELECT ON SEQUENCE {} TO {}').format(sql.Identifier(seq),role))
        for seq in ('hr_payslip_issue_register_id_seq','hr_payslip_pdf_archive_id_seq','hr_kpi_grievances_id_seq',
                    'hr_team_transfer_reviews_id_seq','hr_completion_events_id_seq'):
            conn.execute(sql.SQL('GRANT USAGE,SELECT ON SEQUENCE {} TO {}').format(sql.Identifier(seq),role))
        conn.execute(sql.SQL('REVOKE UPDATE,DELETE,TRUNCATE ON hr_team_registry_events,hr_individual_kpi_events FROM {}').format(role))
        conn.execute(sql.SQL('REVOKE UPDATE,DELETE,TRUNCATE ON hr_completion_events FROM {}').format(role))
    print('safe additive team/KPI upgrade applied; existing HR records unchanged')
    return 0


def _app_conn():
    import psycopg
    from psycopg.rows import dict_row
    return psycopg.connect(config.DATABASE_URL, row_factory=dict_row)


def _password(args):
    pw = os.environ.get("HR_BOOTSTRAP_PASSWORD") or getpass.getpass("New password: ")
    if len(pw) < config.MIN_PASSWORD_LENGTH:
        print("password too short (min %d)" % config.MIN_PASSWORD_LENGTH)
        sys.exit(2)
    return pw


def cmd_create_admin(a):
    from .services.pgstore import PgStore
    pw = _password(a)
    with _app_conn() as conn:
        store = PgStore(conn)
        u = store.user_by_username(a.username)
        if u:
            store.user_set_password(u["id"], hash_password(pw))
            print("password reset for", a.username)
        else:
            store.user_save({"id": "usr" + secrets.token_hex(7), "username": a.username, "name": a.name or a.username, "role": "admin", "active": True,
                             "all_units": True, "unit_ids": [], "perms_add": [], "perms_remove": [], "pw": hash_password(pw)})
            print("admin created:", a.username)
    return 0


def _resolve_units(store, names):
    ids = []
    for n in [x.strip() for x in (names or "").split(",") if x.strip()]:
        uid = store.unit_by_name(n)
        if uid is None:
            sys.exit("unit not found: %r (units are created from employees' department names; see list-users)" % n)
        ids.append(uid)
    return ids


def cmd_create_user(a):
    """New user for another unit/PC: python -m app.cli create-user NAME --role hr_specialist --units "مالی" [--all-units]"""
    from .services.pgstore import PgStore
    if a.role not in ROLE_PERMS:
        sys.exit("role must be one of: " + ", ".join(ROLE_PERMS))
    pw = _password(a)
    with _app_conn() as conn:
        store = PgStore(conn)
        if store.user_by_username(a.username):
            sys.exit("username already exists")
        ids = _resolve_units(store, a.units)
        if not a.all_units and not ids:
            sys.exit("give --units NAME[,NAME] or --all-units (a user without units sees no employee data)")
        store.user_save({"id": "usr" + secrets.token_hex(7), "username": a.username, "name": a.name or a.username, "role": a.role, "active": True,
                         "all_units": bool(a.all_units), "unit_ids": ids, "perms_add": [], "perms_remove": [], "pw": hash_password(pw)})
    print("user created:", a.username, "role:", a.role, "units:", "ALL" if a.all_units else a.units)
    return 0


def cmd_set_units(a):
    from .services.pgstore import PgStore
    with _app_conn() as conn:
        store = PgStore(conn)
        u = store.user_by_username(a.username)
        if not u:
            sys.exit("user not found")
        u["all_units"] = bool(a.all_units)
        u["unit_ids"] = [] if a.all_units else _resolve_units(store, a.units)
        store.user_save(u)
    print("units updated for", a.username)
    return 0


def cmd_set_perms(a):
    """Per-user exceptions on top of the role: python -m app.cli set-perms USER --add view_salary --remove delete_records"""
    from .services.pgstore import PgStore
    split = lambda t: [x.strip() for x in (t or "").split(",") if x.strip()]
    add, rem = split(a.add), split(a.remove)
    unknown = [p for p in add + rem if p not in ALL_PERMISSIONS]
    if unknown:
        sys.exit("unknown permission(s): %s\nvalid: %s" % (", ".join(unknown), ", ".join(ALL_PERMISSIONS)))
    with _app_conn() as conn:
        store = PgStore(conn)
        u = store.user_by_username(a.username)
        if not u:
            sys.exit("user not found")
        if a.clear:
            add, rem = [], []
        u["perms_add"], u["perms_remove"] = add, rem
        store.user_save(u)
        conn.execute("UPDATE sessions SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL", (u["id"],))   # takes effect at next login
    print("permissions updated for", a.username, "| add:", add, "| remove:", rem)
    return 0


def cmd_set_unit_role(a):
    """Different access per unit for the same user: python -m app.cli set-unit-role ali --unit "مالی" --role hr_specialist
    (inside that unit the user gets THAT role's permissions instead of the user's main role; --role none removes the override)."""
    from .services.pgstore import PgStore
    role = None if a.role == "none" else a.role
    if role and role not in ROLE_PERMS:
        sys.exit("role must be one of: " + ", ".join(ROLE_PERMS) + ", none")
    with _app_conn() as conn:
        store = PgStore(conn)
        u = store.user_by_username(a.username)
        if not u:
            sys.exit("user not found")
        uid = store.unit_by_name(a.unit)
        if uid is None or uid not in u["unit_ids"]:
            sys.exit("the user must first have this unit: set-units %s --units \"%s\"" % (a.username, a.unit))
        store.user_unit_role_set(u["id"], uid, role)
        conn.execute("UPDATE sessions SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL", (u["id"],))
    print("unit role set:", a.username, a.unit, "->", role or "(main role)")
    return 0


def cmd_list_users(a):
    from .services.pgstore import PgStore
    with _app_conn() as conn:
        store = PgStore(conn)
        names = {x["id"]: x["name"] for x in store.units_all()}
        uroles = {}
        for r in conn.execute("SELECT user_id, unit_id, role_id FROM user_units WHERE role_id IS NOT NULL"):
            uroles.setdefault(r["user_id"], []).append("%s=%s" % (names.get(r["unit_id"], r["unit_id"]), r["role_id"]))
        print("units:", ", ".join(names.values()) or "(none yet)")
        for u in store.users_all():
            if not u["is_system"]:
                print("%-16s %-14s active=%-5s units=%s %s" % (u["username"], u["role"], u["active"], "ALL" if u["all_units"] else ",".join(names.get(i, str(i)) for i in u["unit_ids"]), ("per-unit roles: " + "; ".join(uroles[u["id"]])) if u["id"] in uroles else ""))
    return 0


def cmd_migrate(a, apply):
    import hashlib
    from .migration.apply import MigrationBlocked, apply_migration
    from .migration.preview import build_preview
    from .services.pgstore import PgStore
    raw = open(a.file, "rb").read()
    sha = hashlib.sha256(raw).hexdigest()
    data = json.loads(raw.decode("utf-8"))
    if not apply:
        rep = build_preview(data, sha)
    else:
        roles = tuple(ROLE_PERMS) if a.all_units_roles == "all" else tuple(x for x in a.all_units_roles.split(",") if x)
        try:
            with _app_conn() as conn:
                rep = apply_migration(PgStore(conn), data, sha, all_units_roles=roles, accept_blocking=a.accept_blocking,
                                      files_root=a.files_root, doc_root=config.DOC_ROOT)
        except MigrationBlocked as e:
            rep = e.report
            print("BLOCKED: %d item(s) need a decision. See the report; nothing was written." % rep["blocking"])
    if a.report:
        open(a.report, "w", encoding="utf-8").write(json.dumps(rep, ensure_ascii=False, indent=2))
    print(json.dumps({k: rep.get(k) for k in ("total", "migrated", "skipped", "failed", "data_insufficient", "duplicates", "warnings", "blocking", "already_applied", "applied")}, ensure_ascii=False))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("gen-env")
    sub.add_parser("list-users")
    sub.add_parser("upgrade-safe")
    p = sub.add_parser("create-user"); p.add_argument("username"); p.add_argument("--name"); p.add_argument("--role", required=True)
    p.add_argument("--units", default=""); p.add_argument("--all-units", action="store_true")
    p = sub.add_parser("set-perms"); p.add_argument("username"); p.add_argument("--add", default=""); p.add_argument("--remove", default=""); p.add_argument("--clear", action="store_true")
    p = sub.add_parser("set-unit-role"); p.add_argument("username"); p.add_argument("--unit", required=True); p.add_argument("--role", required=True)
    p = sub.add_parser("set-units"); p.add_argument("username"); p.add_argument("--units", default=""); p.add_argument("--all-units", action="store_true")
    p = sub.add_parser("init-db"); p.add_argument("--create-db", action="store_true")
    p = sub.add_parser("create-admin"); p.add_argument("username"); p.add_argument("--name")
    p = sub.add_parser("set-password"); p.add_argument("username")
    for name in ("migrate-preview", "migrate-apply"):
        p = sub.add_parser(name); p.add_argument("file"); p.add_argument("--report")
        if name == "migrate-apply":
            p.add_argument("--files-root"); p.add_argument("--accept-blocking", action="store_true")
            p.add_argument("--all-units-roles", default="all", help="'all' (keeps today's behaviour) or e.g. admin,hr_manager")
    a = ap.parse_args(argv)
    if a.cmd == "gen-env":
        return cmd_gen_env(a)
    if a.cmd == "init-db":
        return cmd_init_db(a)
    if a.cmd == "upgrade-safe":
        return cmd_upgrade_safe(a)
    if a.cmd == "create-user":
        return cmd_create_user(a)
    if a.cmd == "set-unit-role":
        return cmd_set_unit_role(a)
    if a.cmd == "set-perms":
        return cmd_set_perms(a)
    if a.cmd == "set-units":
        return cmd_set_units(a)
    if a.cmd == "list-users":
        return cmd_list_users(a)
    if a.cmd in ("create-admin", "set-password"):
        a.name = getattr(a, "name", None)
        return cmd_create_admin(a)
    return cmd_migrate(a, a.cmd == "migrate-apply")


if __name__ == "__main__":
    sys.exit(main())
