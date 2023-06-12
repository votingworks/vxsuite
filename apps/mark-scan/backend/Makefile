# a phony dependency that can be used as a dependency to force builds
FORCE:

build: FORCE
	pnpm install && pnpm build

bootstrap: build

install:
	sudo apt -y update
	sudo apt -y install libpcsclite1 libpcsclite-dev

run:
	pnpm start
