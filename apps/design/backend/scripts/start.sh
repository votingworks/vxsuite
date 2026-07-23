#!/usr/bin/env bash

node ./build/index.js &
node --max-old-space-size=65536 ./build/worker/index.js
