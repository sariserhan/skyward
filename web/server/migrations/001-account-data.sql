-- Better Auth owns its own user/session/account/verification schema.
-- Run its pinned migrations first. Application data uses the verified user ID.
CREATE TABLE IF NOT EXISTS skyward_profiles (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 stripe_customer text UNIQUE
);
CREATE TABLE IF NOT EXISTS skyward_journeys (
 user_id text REFERENCES "user"(id) ON DELETE CASCADE,
 key text NOT NULL, body jsonb NOT NULL, PRIMARY KEY(user_id,key)
);
CREATE TABLE IF NOT EXISTS skyward_checks (
 user_id text REFERENCES "user"(id) ON DELETE CASCADE,
 key text NOT NULL, body jsonb NOT NULL, checked bigint NOT NULL,
 PRIMARY KEY(user_id,key), FOREIGN KEY(user_id,key) REFERENCES skyward_journeys(user_id,key) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS skyward_alerts (
 id serial PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 message text NOT NULL,created bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS skyward_alerts_owner ON skyward_alerts(user_id,id);
CREATE TABLE IF NOT EXISTS skyward_alert_reads (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,through_id integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS skyward_library (
 user_id text REFERENCES "user"(id) ON DELETE CASCADE,
 kind text NOT NULL,key text NOT NULL,body jsonb NOT NULL,
 revision integer NOT NULL CHECK(revision>0),updated bigint NOT NULL,
 PRIMARY KEY(user_id,kind,key)
);
CREATE TABLE IF NOT EXISTS skyward_usage (
 user_id text REFERENCES "user"(id) ON DELETE CASCADE,
 month text NOT NULL,requests integer NOT NULL CHECK(requests>=0),
 cost bigint NOT NULL CHECK(cost>=0),PRIMARY KEY(user_id,month)
);
CREATE INDEX IF NOT EXISTS skyward_usage_month ON skyward_usage(month);
CREATE TABLE IF NOT EXISTS skyward_rate_limits (
 key text PRIMARY KEY,count integer NOT NULL,expires bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS skyward_rate_limits_expiry ON skyward_rate_limits(expires);
