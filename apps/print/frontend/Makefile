
# a phony dependency that can be used as a dependency to force builds
FORCE:

install:

build: FORCE
	pnpm install && pnpm build

bootstrap: install build

run:
	cd prodserver && node index.js
