# a phony dependency that can be used as a dependency to force builds
FORCE:

build-debug: FORCE
	mkdir -p target && cargo build --target-dir target/.

build: FORCE
	mkdir -p target && cargo build --release --target-dir target/.

run:
	./target/release/patinputd

