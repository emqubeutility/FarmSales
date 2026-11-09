-- Optional: a read-only login for Power BI, so Power BI can read but never change data.
-- Replace the password with a long random one, and replace neondb with your database name if it differs.
CREATE ROLE powerbi_reader WITH LOGIN PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
GRANT CONNECT ON DATABASE neondb TO powerbi_reader;
GRANT USAGE ON SCHEMA public TO powerbi_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powerbi_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powerbi_reader;
