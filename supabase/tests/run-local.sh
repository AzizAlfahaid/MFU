#!/usr/bin/env bash
# Runs the access-rule tests against a throwaway local Postgres database.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=mfu_test
PSQL="psql -X -q -v ON_ERROR_STOP=1 -U postgres -h localhost"
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d $DB -f supabase/tests/stubs.sql
for f in supabase/migrations/*.sql; do $PSQL -d $DB -f "$f"; done
$PSQL -d $DB -f supabase/tests/rls.sql
echo "RLS TESTS PASSED"
