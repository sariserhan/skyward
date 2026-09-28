CREATE TABLE IF NOT EXISTS skyward_premium_state (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 kind text NOT NULL,key text NOT NULL,body jsonb NOT NULL,
 PRIMARY KEY(user_id,kind,key)
);
CREATE INDEX IF NOT EXISTS skyward_premium_state_kind ON skyward_premium_state(kind,key);
CREATE TABLE IF NOT EXISTS skyward_premium_leases (key text PRIMARY KEY,expires bigint NOT NULL);
CREATE INDEX IF NOT EXISTS skyward_premium_leases_expiry ON skyward_premium_leases(expires);
