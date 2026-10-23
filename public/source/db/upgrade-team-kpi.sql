
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
