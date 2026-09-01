#!/usr/bin/env bash

# Shared opt-out switch for the Turborepo-backed orchestration.
#
# Turbo is the default. Set `VX_USE_TURBO` to a falsy value (`0`, `false`, `no`
# or `off`, case-insensitively) to fall back to the pre-Turbo pnpm scripts.

use_turbo() {
  case "$(printf '%s' "${VX_USE_TURBO:-1}" | tr '[:upper:]' '[:lower:]')" in
    0 | false | no | off) return 1 ;;
    *) return 0 ;;
  esac
}
