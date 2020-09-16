
# a phony dependency that can be used as a dependency to force builds
FORCE:

build: FORCE
	yarn install && yarn build

run:
	cd ../prodserver && node index.js ../election-manager
