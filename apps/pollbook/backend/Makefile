NODE_ENV ?= development
OS := $(shell lsb_release -cs)
TIMESTAMP := $(shell date --iso-8601=seconds --utc | sed 's/+.*$\//g' | tr ':' '-')

install-dev-dependencies:
	# Install necessary packages for Avahi
	sudo apt install -y avahi-daemon avahi-utils

FORCE:

install:

build: FORCE
	pnpm install && pnpm build

bootstrap: install build

run:
	pnpm start
