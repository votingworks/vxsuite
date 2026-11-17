# a phony dependency that can be used as a dependency to force builds
FORCE:

build-debug: FORCE
	mkdir -p target && cargo build --target-dir target/.

build: FORCE
	pnpm build:self

run:
	./build/patinputd

