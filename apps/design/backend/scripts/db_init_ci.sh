#!/usr/bin/env bash

# [TODO] Pre-install postgres in the CI docker image.

SCRIPT_DIR="$(dirname "$0")"

sudo apt install -y --no-install-recommends postgresql

exec "${SCRIPT_DIR}/db_reset_dev.sh"
