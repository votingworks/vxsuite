#!/usr/bin/env bash

set -euo pipefail

pnpm copyfiles -u 2 src/audio/*.mp3 build/audio/
