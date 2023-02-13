#!/usr/bin/env bash

set -euo pipefail

### Install python3.9, pip, passlib, and ansible

# Check for python3.9 and install if not present
# If it's not present, go ahead and install pip too
if [[ ! `which python3.9` ]]; then
  sudo apt install -y python3.9 python3-pip
fi

# Check for python3-pip, in case python3.9 was installed without pip
if [[ ! `python3.9 -m pip --version` ]]; then
  sudo apt install -y python3-pip
fi

# Check for passlib, install if not present
if [[ ! `python3.9 -m pip show passlib` ]]; then
  sudo python3.9 -m pip install passlib
fi

# Check for ansible, install if not present
if [[ ! `python3.9 -m pip show ansible` ]]; then
  sudo python3.9 -m pip install ansible
fi

exit 0
