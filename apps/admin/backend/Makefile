NODE_ENV ?= development

# a phony dependency that can be used as a dependency to force builds
FORCE:

install:
	sudo apt -y update
	sudo apt -y install libpcsclite1 libpcsclite-dev

build: FORCE
	pnpm install --filter {.}... --filter {.}... --filter {.}... --filter {.}... --filter {.}... --filter {.}... --filter {.}... && pnpm build

bootstrap: install build

run:
	pnpm start

