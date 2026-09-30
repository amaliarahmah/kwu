-- Meniru peran & skema bawaan proyek Supabase agar schema.sql bisa diuji di Postgres lokal.
-- HANYA untuk pengujian; jangan dijalankan di Supabase.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'authenticator';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login createrole noinherit password 'auth';
-- Di Supabase, peran "postgres" yang menjalankan SQL Editor bukan superuser.
create role supa_admin login createrole bypassrls password 'admin';
grant anon, authenticated, service_role to supa_admin;

create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role, supa_admin;
alter default privileges for role supabase_auth_admin in schema auth grant all on tables to supa_admin;
alter default privileges for role supabase_auth_admin in schema auth grant all on functions to supa_admin, anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth;

create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role, supa_admin;
grant usage, create on schema public to supa_admin, supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role;
