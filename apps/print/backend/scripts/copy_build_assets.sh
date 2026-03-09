#!/usr/bin/env bash

set -euo pipefail

pnpm copyfiles -u 2 src/printing/test-print.pdf build/printing
