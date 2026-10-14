#!/usr/bin/env bash

node ./build/index.js &
node --max-old-space-size=8192 ./build/worker/index.js
