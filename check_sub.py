# check_sub.py
from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://osf:osf_prod_2026@osf-postgres.ca3qeykqwqde.us-east-1.rds.amazonaws.com:5432/osf"

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    result = conn.execute(
        text("SELECT id, owner_type, status, current_period_end FROM subscriptions WHERE owner_id = :oid"),
        {"oid": "d76b72de-6bcf-4cfc-a36a-880d3b4bc06c"}
    )
    rows = result.fetchall()
    print(rows)