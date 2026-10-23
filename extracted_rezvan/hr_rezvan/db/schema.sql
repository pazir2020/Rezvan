-- HR Rezvan — PostgreSQL schema (final build). Applied by `python -m app.cli init-db`.
-- Status: UNTESTED against a real PostgreSQL server (none was available while authoring).
-- Conventions: ids are TEXT (existing Employee/record ids are preserved); every editable row has `version`
-- (optimistic concurrency -> 409); soft delete uses deleted_* columns.

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value JSONB NOT NULL);

CREATE TABLE IF NOT EXISTS units (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,                 -- same strings as employees.department (unitSchedules keys use them)
  legacy_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, label TEXT NOT NULL,
  all_permissions BOOLEAN NOT NULL DEFAULT FALSE      -- role property (admin '*'); unrelated to users.all_units
);
CREATE TABLE IF NOT EXISTS permissions (
  code TEXT PRIMARY KEY,
  category TEXT CHECK (category IN ('view','create','edit','delete','approve','reject','print','export','upload','download','manage')),
  sensitive BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id),
  permission_code TEXT NOT NULL REFERENCES permissions(code),
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  legacy_username TEXT,
  name TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,           -- legacy 'system' actor: cannot log in
  all_units BOOLEAN NOT NULL DEFAULT FALSE,           -- Unit access ONLY; never grants a permission
  perms_add TEXT[] NOT NULL DEFAULT '{}',
  perms_remove TEXT[] NOT NULL DEFAULT '{}',
  pw_algo TEXT CHECK (pw_algo IN ('sha256','pbkdf2','argon2id')),
  pw_iter INTEGER, pw_salt TEXT, pw_hash TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (is_system OR pw_hash IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
CREATE TABLE IF NOT EXISTS user_units (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id BIGINT NOT NULL REFERENCES units(id),
  role_id TEXT REFERENCES roles(id),                  -- optional per-unit role
  PRIMARY KEY (user_id, unit_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                        -- SHA-256 of the random token (the token lives only in the HttpOnly cookie)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idle_expires_at TIMESTAMPTZ NOT NULL,
  abs_expires_at TIMESTAMPTZ NOT NULL,
  ip INET, user_agent TEXT, revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL, ip INET,
  at TIMESTAMPTZ NOT NULL DEFAULT now(), success BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_user ON login_attempts (username, at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip ON login_attempts (ip, at DESC);

-- employees: ordinary columns + Tier B in extra. Tier A lives in employee_sensitive (separate read/write permissions).
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  code TEXT, full_name TEXT NOT NULL,
  unit_id BIGINT REFERENCES units(id), department_legacy TEXT,
  level TEXT, manager_id TEXT, hire_date DATE, exit_date DATE, phone TEXT, settlement_status TEXT,
  extra JSONB NOT NULL DEFAULT '{}',
  legacy_id TEXT, version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by TEXT,
  updated_at TIMESTAMPTZ, updated_by TEXT,
  deleted_at TIMESTAMPTZ, deleted_by TEXT, delete_reason TEXT, deleted_via TEXT,
  CONSTRAINT employees_extra_no_sensitive CHECK (NOT (extra ?| ARRAY['salary','settlement_amount','national_id','bank','account','sheba','ins_no']))
);
CREATE INDEX IF NOT EXISTS employees_unit ON employees (unit_id);
CREATE UNIQUE INDEX IF NOT EXISTS employees_code_live ON employees (code) WHERE code IS NOT NULL AND deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS employee_sensitive (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id),
  salary NUMERIC(20,2), settlement_amount NUMERIC(20,2),      -- view_salary
  national_id TEXT, ins_no TEXT,                              -- view_national_id
  bank TEXT, account TEXT, sheba TEXT,                        -- view_bank
  version INTEGER NOT NULL DEFAULT 1
);

-- every other collection (leaves, attendance, loans, ..., documents metadata, payrollLocks). JSONB is validated by the
-- API against COLLECTION_SPECS (allowed fields, permissions, sensitive fields) — it is not a free-for-all.
CREATE TABLE IF NOT EXISTS records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  employee_id TEXT,
  data JSONB NOT NULL,
  legacy_id TEXT, version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by TEXT,
  updated_at TIMESTAMPTZ, updated_by TEXT,
  deleted_at TIMESTAMPTZ, deleted_by TEXT, delete_reason TEXT,
  deleted_via TEXT CHECK (deleted_via IN ('flag','trash')),
  delete_label TEXT,
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS records_employee ON records (employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS records_lock_month ON records ((data->>'month')) WHERE collection = 'payrollLocks';
CREATE UNIQUE INDEX IF NOT EXISTS records_empextra_employee ON records (employee_id) WHERE collection = 'empExtra' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS kv (                                -- settings and alertStates
  ns TEXT NOT NULL CHECK (ns IN ('settings','alertStates')),
  key TEXT NOT NULL, value JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_by TEXT,
  PRIMARY KEY (ns, key)
);

-- audit: server-side, append-only (no API updates or deletes it; triggers + privileges enforce it)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id TEXT, username TEXT, user_name TEXT, role TEXT,
  action TEXT NOT NULL, module TEXT, section TEXT, text TEXT,
  record_id TEXT, employee_id TEXT,
  before JSONB, after JSONB,
  ip TEXT, ua TEXT, result TEXT, reason TEXT,
  legacy BOOLEAN NOT NULL DEFAULT FALSE, legacy_text TEXT,
  prev_hash TEXT, row_hash TEXT                               -- optional chain (not populated in this build)
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log (at DESC);
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

CREATE TABLE IF NOT EXISTS migration_runs (
  id BIGSERIAL PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('preview','apply')),
  source_sha256 TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
  summary JSONB, report JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS migration_apply_once ON migration_runs (source_sha256) WHERE mode = 'apply' AND finished_at IS NOT NULL;


-- Rezvan batch-production order tracking. Additive; no old HRMS data is changed.
CREATE TABLE IF NOT EXISTS oven_orders (
 id BIGSERIAL PRIMARY KEY,
 customer_name TEXT NOT NULL CHECK (char_length(customer_name) BETWEEN 1 AND 150),
 oven_model TEXT NOT NULL CHECK (oven_model IN ('تنور سنگک متحرک بزرگ','تنور سنگک متحرک متوسط','تنور سنگک متحرک کوچک','تنور سنگک متحرک مینی','تنور سنگک ثابت آپشنال','لارج')),
 facade_name TEXT NOT NULL CHECK (char_length(facade_name) BETWEEN 1 AND 150),
 forge_team SMALLINT CHECK (forge_team BETWEEN 1 AND 2),
 masonry_team SMALLINT CHECK (masonry_team BETWEEN 1 AND 3),
 forge_status TEXT NOT NULL DEFAULT 'pending' CHECK (forge_status IN ('pending','working','ready','accepted','correction')),
 masonry_status TEXT NOT NULL DEFAULT 'pending' CHECK (masonry_status IN ('pending','working','finished','correction')),
 brickwork BOOLEAN NOT NULL DEFAULT FALSE,
 cementwork BOOLEAN NOT NULL DEFAULT FALSE,
 insulation BOOLEAN NOT NULL DEFAULT FALSE,
 facade_done BOOLEAN NOT NULL DEFAULT FALSE,
 forge_start DATE, forge_finish DATE, handed_over DATE, masonry_start DATE, masonry_finish DATE,
 quality_note TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 CHECK (forge_finish IS NULL OR forge_start IS NULL OR forge_finish >= forge_start),
 CHECK (masonry_finish IS NULL OR masonry_start IS NULL OR masonry_finish >= masonry_start),
 CHECK (handed_over IS NULL OR forge_finish IS NULL OR handed_over >= forge_finish),
 CHECK (masonry_start IS NULL OR handed_over IS NULL OR masonry_start >= handed_over)
);
CREATE INDEX IF NOT EXISTS oven_orders_updated ON oven_orders(updated_at DESC);
CREATE TABLE IF NOT EXISTS oven_order_events (
 id BIGSERIAL PRIMARY KEY, oven_id BIGINT NOT NULL REFERENCES oven_orders(id),
 changed_at TIMESTAMPTZ NOT NULL DEFAULT now(), changed_by TEXT NOT NULL,
 previous JSONB, current JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS oven_events_order ON oven_order_events(oven_id, changed_at DESC);


-- Additive, per-order/team/date PERSON-HOURS entry; no payroll or bonus mutation.
CREATE TABLE IF NOT EXISTS oven_team_hours (
 id BIGSERIAL PRIMARY KEY,
 oven_id BIGINT NOT NULL REFERENCES oven_orders(id),
 team_kind TEXT NOT NULL CHECK(team_kind IN ('forge','masonry')),
 team_number SMALLINT NOT NULL CHECK(team_number BETWEEN 1 AND 3),
 work_date DATE NOT NULL,
 ordinary_person_hours NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (ordinary_person_hours BETWEEN 0 AND 96),
 overtime_person_hours NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (overtime_person_hours BETWEEN 0 AND 96),
 excluded_person_hours NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (excluded_person_hours BETWEEN 0 AND 96),
 overtime_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(overtime_reason)<=500),
 exclusion_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(exclusion_reason)<=500),
 note TEXT NOT NULL DEFAULT '' CHECK(char_length(note)<=1000),
 approval TEXT NOT NULL DEFAULT 'pending' CHECK(approval IN ('pending','approved','rejected')),
 approver TEXT, approved_at TIMESTAMPTZ,
 version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(oven_id,team_kind,work_date),
 CHECK (excluded_person_hours <= ordinary_person_hours+overtime_person_hours),
 CHECK (overtime_person_hours=0 OR char_length(trim(overtime_reason))>0),
 CHECK (excluded_person_hours=0 OR char_length(trim(exclusion_reason))>0),
 CHECK (ordinary_person_hours+overtime_person_hours>0),
 CHECK (team_kind<>'forge' OR team_number<=2)
);
CREATE INDEX IF NOT EXISTS oven_team_hours_date ON oven_team_hours(work_date,team_kind,team_number);
CREATE TABLE IF NOT EXISTS oven_team_hours_events (
 id BIGSERIAL PRIMARY KEY, entry_id BIGINT NOT NULL REFERENCES oven_team_hours(id),
 changed_at TIMESTAMPTZ NOT NULL DEFAULT now(), changed_by TEXT NOT NULL,
 action TEXT NOT NULL, previous JSONB, current JSONB NOT NULL
);


-- Non-payroll HR development add-on. Editable skills and action tracking, with audit.
CREATE TABLE IF NOT EXISTS hr_skill_assessments (
 id BIGSERIAL PRIMARY KEY,employee_id TEXT NOT NULL REFERENCES employees(id),
 skill_name TEXT NOT NULL CHECK(char_length(skill_name) BETWEEN 2 AND 100),
 skill_level SMALLINT NOT NULL CHECK(skill_level BETWEEN 0 AND 4),
 assessment_date DATE NOT NULL, evidence TEXT NOT NULL DEFAULT '' CHECK(char_length(evidence)<=1200),
 training_needed BOOLEAN NOT NULL DEFAULT FALSE, next_review DATE,
 created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),version INT NOT NULL DEFAULT 1,
 UNIQUE(employee_id,skill_name)
);
CREATE TABLE IF NOT EXISTS hr_followup_actions (
 id BIGSERIAL PRIMARY KEY,employee_id TEXT REFERENCES employees(id),
 category TEXT NOT NULL CHECK(category IN ('training','contract','equipment','safety','performance','other')),
 title TEXT NOT NULL CHECK(char_length(title) BETWEEN 3 AND 150),
 description TEXT NOT NULL DEFAULT '' CHECK(char_length(description)<=1500),
 owner TEXT NOT NULL CHECK(char_length(owner) BETWEEN 1 AND 120),
 due_date DATE, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','working','done','cancelled')),
 result TEXT NOT NULL DEFAULT '' CHECK(char_length(result)<=1200),
 created_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_by TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),version INT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS hr_development_events (
 id BIGSERIAL PRIMARY KEY,entity TEXT NOT NULL CHECK(entity IN ('skill','action')),
 entity_id BIGINT NOT NULL,operation TEXT NOT NULL,changed_by TEXT NOT NULL,
 changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),old_value JSONB,new_value JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS hr_followup_due ON hr_followup_actions(status,due_date);


-- HR approvals: separated from legal contract status, pay terms and payroll.
CREATE TABLE IF NOT EXISTS hr_probation_reviews (
 id BIGSERIAL PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
 evaluation_date DATE NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN ('continue','reject','needs_review')),
 skill_assessment_id BIGINT REFERENCES hr_skill_assessments(id),
 notes TEXT NOT NULL CHECK(char_length(notes) BETWEEN 10 AND 1500),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 submitted_by TEXT NOT NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ, reviewer_note TEXT,
 version INT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS hr_technical_allowance_proposals (
 id BIGSERIAL PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id),
 skill_assessment_id BIGINT NOT NULL REFERENCES hr_skill_assessments(id),
 training_action_id BIGINT REFERENCES hr_followup_actions(id),
 proposed_amount_toman BIGINT NOT NULL CHECK(proposed_amount_toman>=0),
 effective_date DATE NOT NULL,
 justification TEXT NOT NULL CHECK(char_length(justification) BETWEEN 10 AND 1500),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 submitted_by TEXT NOT NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ, reviewer_note TEXT,
 version INT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS hr_approval_events (
 id BIGSERIAL PRIMARY KEY, entity TEXT NOT NULL CHECK(entity IN ('probation','allowance')),
 entity_id BIGINT NOT NULL, operation TEXT NOT NULL, actor_id TEXT NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), snapshot JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_probation_review_employee ON hr_probation_reviews(employee_id,status);
CREATE INDEX IF NOT EXISTS idx_hr_allowance_employee ON hr_technical_allowance_proposals(employee_id,status);


-- KPI team evaluations. Separate from payroll and production-point engine.
-- 60/40 is a proposed distributive policy; no automatic salary mutation.
CREATE TABLE IF NOT EXISTS hr_team_kpi_periods (
 id BIGSERIAL PRIMARY KEY,
 period_key TEXT NOT NULL CHECK(period_key ~ '^14[0-9]{2}-(0[1-9]|1[0-2])$'),
 team_kind TEXT NOT NULL CHECK(team_kind IN ('forge','masonry')),
 team_number SMALLINT NOT NULL CHECK(team_number BETWEEN 1 AND 3),
 production_points NUMERIC(12,2) CHECK(production_points BETWEEN 0 AND 100000),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),
 created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
 version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(period_key,team_kind,team_number),
 CHECK (team_kind <> 'forge' OR team_number <= 2)
);
CREATE TABLE IF NOT EXISTS hr_team_kpi_people (
 period_id BIGINT NOT NULL REFERENCES hr_team_kpi_periods(id) ON DELETE CASCADE,
 employee_id TEXT NOT NULL REFERENCES employees(id),
 ratings JSONB NOT NULL,
 evidence TEXT NOT NULL DEFAULT '' CHECK(char_length(evidence)<=1200),
 PRIMARY KEY(period_id,employee_id)
);
CREATE TABLE IF NOT EXISTS hr_team_kpi_events (
 id BIGSERIAL PRIMARY KEY, period_id BIGINT NOT NULL REFERENCES hr_team_kpi_periods(id),
 action TEXT NOT NULL, actor_id TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 snapshot JSONB NOT NULL
);

-- Auditable, reversible KPI-to-payslip adjustment workflow (does not modify base salary).
CREATE TABLE IF NOT EXISTS hr_kpi_payroll_transfers (
 period_id BIGINT PRIMARY KEY REFERENCES hr_team_kpi_periods(id),
 month TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('applied','reverted')),
 approved_by TEXT NOT NULL, approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 approve_note TEXT NOT NULL, snapshot JSONB NOT NULL,
 reverted_by TEXT, reverted_at TIMESTAMPTZ, revert_note TEXT
);
CREATE TABLE IF NOT EXISTS hr_kpi_payroll_transfer_events (
 id BIGSERIAL PRIMARY KEY,period_id BIGINT NOT NULL REFERENCES hr_team_kpi_periods(id),
 action TEXT NOT NULL, actor_id TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 detail JSONB NOT NULL
);

-- Integrated HR operations add-on: no destructive changes to original HRMS data.
CREATE TABLE IF NOT EXISTS hr_financial_scenarios (
 id BIGSERIAL PRIMARY KEY,
 employee_id TEXT NOT NULL REFERENCES employees(id),
 component TEXT NOT NULL CHECK(component IN ('base_salary','technical_allowance')),
 current_toman BIGINT NOT NULL CHECK(current_toman>=0),
 proposed_toman BIGINT NOT NULL CHECK(proposed_toman>=0),
 effective_date DATE NOT NULL,
 months SMALLINT NOT NULL CHECK(months BETWEEN 1 AND 12),
 baseline_reference TEXT NOT NULL,
 justification TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','reverted')),
 created_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 decided_by TEXT,decided_at TIMESTAMPTZ,decision_note TEXT,
 reverted_by TEXT,reverted_at TIMESTAMPTZ,revert_note TEXT,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_financial_employee ON hr_financial_scenarios(employee_id,status);

-- Explicit link to an ALREADY CREATED employee. Never duplicates employee/candidate records.
CREATE TABLE IF NOT EXISTS hr_hiring_cases (
 id BIGSERIAL PRIMARY KEY,
 candidate_id TEXT NOT NULL UNIQUE,
 employee_id TEXT NOT NULL UNIQUE REFERENCES employees(id),
 stage TEXT NOT NULL DEFAULT 'linked' CHECK(stage IN
 ('linked','initial_contract','probation','confirmed','monthly_contracts','closed')),
 note TEXT NOT NULL,created_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_by TEXT,updated_at TIMESTAMPTZ,version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS hr_alert_action_links (
 source_type TEXT NOT NULL CHECK(source_type IN('contract_end','probation_pending','allowance_pending')),
 source_id TEXT NOT NULL,action_id BIGINT NOT NULL UNIQUE REFERENCES hr_followup_actions(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(source_type,source_id)
);


-- HRMS final audit: historical real team rosters, supervisor boundaries and versioned KPI weights.
-- Do not pre-populate these with guesses: HR must register and attest real assignments.
CREATE TABLE IF NOT EXISTS hr_team_memberships (
 id BIGSERIAL PRIMARY KEY,
 employee_id TEXT NOT NULL REFERENCES employees(id),
 team_kind TEXT NOT NULL CHECK(team_kind IN ('forge','masonry')),
 team_number SMALLINT NOT NULL CHECK(team_number BETWEEN 1 AND 3),
 valid_from DATE NOT NULL, valid_to DATE,
 assigned_by TEXT NOT NULL, note TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (team_kind <> 'forge' OR team_number <= 2),
 CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS hr_team_memberships_employee_dates ON hr_team_memberships(employee_id,valid_from,valid_to);
CREATE TABLE IF NOT EXISTS hr_team_supervisors (
 id BIGSERIAL PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 team_kind TEXT NOT NULL CHECK(team_kind IN ('forge','masonry')),
 team_number SMALLINT NOT NULL CHECK(team_number BETWEEN 1 AND 3),
 valid_from DATE NOT NULL, valid_to DATE,
 assigned_by TEXT NOT NULL, note TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (team_kind <> 'forge' OR team_number <= 2),
 CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE TABLE IF NOT EXISTS hr_team_kpi_weights (
 team_kind TEXT PRIMARY KEY CHECK(team_kind IN ('forge','masonry')),
 weights JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hr_team_registry_events (
 id BIGSERIAL PRIMARY KEY,
 action TEXT NOT NULL,entity_id TEXT NOT NULL,actor_id TEXT NOT NULL,
 detail JSONB NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A KPI period captures the weights in force when it was created.
ALTER TABLE hr_team_kpi_periods ADD COLUMN IF NOT EXISTS weights JSONB NOT NULL DEFAULT '[30,25,20,15,10]'::jsonb;


-- Independent KPI for support units; no monetary column, no salary side effects.
CREATE TABLE IF NOT EXISTS hr_individual_kpi_profiles (
 profile_kind TEXT PRIMARY KEY CHECK (profile_kind IN ('electrical','technical','finance','hr')),
 labels JSONB NOT NULL,weights JSONB NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL,
 reason TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS hr_individual_kpi_periods (
 id BIGSERIAL PRIMARY KEY,
 employee_id TEXT NOT NULL REFERENCES employees(id),
 period_key TEXT NOT NULL CHECK(period_key ~ '^14[0-9]{2}-(0[1-9]|1[0-2])$'),
 profile_kind TEXT NOT NULL CHECK (profile_kind IN ('electrical','technical','finance','hr')),
 labels JSONB NOT NULL,weights JSONB NOT NULL,ratings JSONB NOT NULL,
 evidence TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
 version INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by TEXT,reviewed_at TIMESTAMPTZ,review_note TEXT,
 UNIQUE(employee_id,period_key)
);
CREATE TABLE IF NOT EXISTS hr_individual_kpi_events (
 id BIGSERIAL PRIMARY KEY,
 period_id BIGINT REFERENCES hr_individual_kpi_periods(id),
 action TEXT NOT NULL,actor_id TEXT NOT NULL,detail JSONB NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HRMS completion: verified control workflow, not replacement of the payslip engine.
CREATE TABLE IF NOT EXISTS hr_payroll_review_packets (
  month TEXT PRIMARY KEY CHECK(month ~ '^14[0-9]{2}-(0[1-9]|1[0-2])$'),
  checklist JSONB NOT NULL DEFAULT '{}',
  evidence_refs JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected')),
  source_fingerprint TEXT NOT NULL,
  note TEXT NOT NULL,
  prepared_by TEXT NOT NULL, prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by TEXT, reviewed_at TIMESTAMPTZ, review_note TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS hr_payslip_issue_register (
 id BIGSERIAL PRIMARY KEY,
 month TEXT NOT NULL CHECK(month ~ '^14[0-9]{2}-(0[1-9]|1[0-2])$'),
 employee_id TEXT NOT NULL REFERENCES employees(id),
 source_reference TEXT NOT NULL,
 issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 issued_by TEXT NOT NULL,
 note TEXT NOT NULL,
 UNIQUE(month,employee_id)
);
CREATE TABLE IF NOT EXISTS hr_kpi_grievances (
 id BIGSERIAL PRIMARY KEY,
 period_id BIGINT NOT NULL REFERENCES hr_team_kpi_periods(id),
 employee_id TEXT NOT NULL REFERENCES employees(id),
 statement TEXT NOT NULL,
 original_score NUMERIC(6,2) NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','upheld','dismissed')),
 filed_by TEXT NOT NULL, filed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ, decision_note TEXT,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_hr_kpi_grievance_period ON hr_kpi_grievances(period_id,status);
CREATE TABLE IF NOT EXISTS hr_team_transfer_reviews (
 id BIGSERIAL PRIMARY KEY,
 employee_id TEXT NOT NULL REFERENCES employees(id),
 period_key TEXT NOT NULL CHECK(period_key ~ '^14[0-9]{2}-(0[1-9]|1[0-2])$'),
 reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','closed')),
 filed_by TEXT NOT NULL, filed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by TEXT, reviewed_at TIMESTAMPTZ, decision_note TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(employee_id,period_key)
);
CREATE TABLE IF NOT EXISTS hr_completion_events (
 id BIGSERIAL PRIMARY KEY, category TEXT NOT NULL, entity_id TEXT NOT NULL,
 action TEXT NOT NULL, actor_id TEXT NOT NULL,
 at TIMESTAMPTZ NOT NULL DEFAULT NOW(), detail JSONB NOT NULL DEFAULT '{}'
);

-- Metadata for immutable server-side payslip PDF; bytes live under HR_DOC_ROOT.
CREATE TABLE IF NOT EXISTS hr_payslip_pdf_archive (
 id BIGSERIAL PRIMARY KEY,
 issue_id BIGINT NOT NULL UNIQUE REFERENCES hr_payslip_issue_register(id),
 month TEXT NOT NULL CHECK(month ~ '^14[0-9]{2}-(0[1-9]|1[0-2])$'),
 employee_id TEXT NOT NULL REFERENCES employees(id),
 original_filename TEXT NOT NULL,
 stored_relative_path TEXT NOT NULL UNIQUE,
 size_bytes BIGINT NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 26214400),
 sha256 TEXT NOT NULL,
 archived_by TEXT NOT NULL,
 archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 source_fingerprint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hr_payslip_pdf_archive_month ON hr_payslip_pdf_archive(month);
