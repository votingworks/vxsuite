#!/bin/bash
set -euxo pipefail  # Show each command, exit on error

DEVICE="/dev/ttyACM0"
stty -F "$DEVICE" 115200 cs8 -cstopb -parenb -ixon -ixoff -crtscts

echo "Listening for barcode scans on $DEVICE..."
while IFS= read -r line < "$DEVICE"; do
  line="${line//$'\r'/}"
  if [ -n "$line" ]; then
    echo "Received scan: $line"
  fi
done

