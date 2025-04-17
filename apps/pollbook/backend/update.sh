#!/bin/bash

# Remove the pollbook data directory
rm -rf /vx/data/pollbook

# Start NetworkManager service
sudo systemctl start NetworkManager

# Wait for internet connectivity (up to 10 seconds)
echo "Checking internet connectivity..."
for i in {1..10}; do
  if ping -c 1 google.com &> /dev/null; then
    echo "Internet connected."
    break
  fi
  echo "Retrying... ($i)"
  sleep 1
done

# Run git pull to update the repository
git pull

# Run pnpm type-check
pnpm type-check

# Stop NetworkManager service
sudo systemctl stop NetworkManager

# Start join-mesh-networking service
sudo systemctl start join-mesh-network