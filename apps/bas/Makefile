
# a phony dependency that can be used as a dependency to force builds
FORCE:

install:
	# sudo apt install -y DEPS

build: FORCE
	pnpm install && pnpm build

run:
	cd prodserver && node index.js
