-- Database roles (Schema §9, TRD SP-05 / SR-02). Runs once, as the superuser, when the
-- data volume is first initialised. Passwords come from the container environment.
--
-- jamii_owner  owns the database and the public schema; runs `prisma migrate deploy` only.
-- jamii_app    API and worker at runtime; gets privileges from migrations (grants script),
--              never table write privileges.

\set ON_ERROR_STOP on
\getenv owner_pw JAMII_OWNER_PASSWORD
\getenv app_pw JAMII_APP_PASSWORD
\getenv db POSTGRES_DB

-- CREATEDB is local-only: `prisma migrate dev` creates a temporary shadow database.
-- UAT and production create jamii_owner without it.
CREATE ROLE jamii_owner LOGIN CREATEDB PASSWORD :'owner_pw';
CREATE ROLE jamii_app   LOGIN PASSWORD :'app_pw';

-- The public schema belongs to pg_database_owner, so this also makes jamii_owner its owner.
ALTER DATABASE :"db" OWNER TO jamii_owner;

REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO jamii_app;
