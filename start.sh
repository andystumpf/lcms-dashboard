#!/usr/bin/env bash
# Start LCMS dashboard (API + SQLite). Run from anywhere.
cd "$(dirname "$0")"
exec node server/api.mjs
