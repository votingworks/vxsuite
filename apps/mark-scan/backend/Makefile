# a phony dependency that can be used as a dependency to force builds
FORCE:

build: FORCE
	pnpm install && pnpm build && ./build-patinputd.sh

bootstrap: build

install:

run:
	pnpm start

run-pat-daemon:
	./build/patinputd
