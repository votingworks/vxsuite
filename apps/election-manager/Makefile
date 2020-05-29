
# a phony dependency that can be used as a dependency to force builds
FORCE:

build: FORCE
	yarn --cwd client install && yarn --cwd client build && yarn --cwd prodserver install

run:
	cd prodserver && node index.js
