NODE_ENV ?= development
TIMESTAMP := $(shell date --iso-8601=seconds --utc | sed 's/+.*$\//g' | tr ':' '-')

# a phony dependency that can be used as a dependency to force builds
FORCE:

install: ;

build: FORCE
	pnpm install && pnpm build

bootstrap: install build

run:
	pnpm start

debug-dump:
	git rev-parse HEAD > REVISION
	zip -r debug-dump-$(TIMESTAMP).zip REVISION tmp *.db *.db.digest
	rm REVISION
	@echo "Debug info dumped to debug-dump-$(TIMESTAMP).zip"
