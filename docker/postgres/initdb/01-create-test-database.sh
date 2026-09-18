#!/bin/sh
# Runs once, when the postgres container initialises an empty data volume.
# Creates "<POSTGRES_DB>_test" for backend integration tests, so tests never
# touch the development database.
set -eu

TEST_DB="${POSTGRES_DB}_test"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE DATABASE "${TEST_DB}" OWNER "${POSTGRES_USER}";
EOSQL

echo "Created test database ${TEST_DB}"
