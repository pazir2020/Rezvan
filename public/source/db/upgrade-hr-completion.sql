-- Additive HR completion update. Run only after verifying backup; no deletes.

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
