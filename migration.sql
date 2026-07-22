-- migration.sql
--
-- Run this ONCE against your production database BEFORE deploying the
-- updated db.py / db_context.py / db_org.py. create_all() only creates
-- tables that don't exist yet — it will happily create the brand-new
-- `organizations` and `invites` tables on its own, but it will NOT add
-- these new columns to your existing `agents` and `company_context`
-- tables. Without running this first, the app will crash on startup or
-- the first query touching one of these columns.
--
-- Usage:
--   docker compose exec -T db psql -U osf -d osf < migration.sql
-- (adjust user/db name if yours differ from the DATABASE_URL default)
--
-- Every ADD COLUMN below uses IF NOT EXISTS, so this is safe to run more
-- than once by accident — it won't error on columns that already exist.

-- -- Organization membership on agents -----------------------------------
ALTER TABLE agents ADD COLUMN IF NOT EXISTS org_id     VARCHAR;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS role       VARCHAR;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS manager_id VARCHAR;

CREATE INDEX IF NOT EXISTS ix_agents_org_id     ON agents (org_id);
CREATE INDEX IF NOT EXISTS ix_agents_manager_id ON agents (manager_id);

-- -- Onboarding profile fields on agents -----------------------------------
ALTER TABLE agents ADD COLUMN IF NOT EXISTS country               VARCHAR;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS language              VARCHAR;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS job_title             VARCHAR;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS role_summary          TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS company_name          VARCHAR;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS sales_methodology     VARCHAR;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS primary_goal          VARCHAR;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS what_we_sell          TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS onboarding_completed  BOOLEAN DEFAULT FALSE;

-- -- Org-level shared context on company_context ---------------------------
ALTER TABLE company_context ADD COLUMN IF NOT EXISTS org_id VARCHAR;
CREATE INDEX IF NOT EXISTS ix_company_context_org_id ON company_context (org_id);

-- Note: existing rows in company_context will have org_id = NULL, which is
-- correct — they were all individual-account uploads before this change,
-- and NULL org_id is exactly what marks "personal context" going forward.

-- -- Email verification (run once, same as everything else in this file) --
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;