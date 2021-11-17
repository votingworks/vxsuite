NODE_ENV ?= development
PLATFORM := $(shell uname)
TIMESTAMP := $(shell date --iso-8601=seconds --utc | sed 's/+.*$\//g' | tr ':' '-')

# a phony dependency that can be used as a dependency to force builds
FORCE:

install:
	sudo add-apt-repository -y ppa:sane-project/sane-release
	sudo apt-get -y update
	sudo apt install -y libsane build-essential libx11-dev libjpeg-dev libpng-dev

build: FORCE
	pnpm install && pnpm build

run:
	pnpm start

debug-dump:
	git rev-parse HEAD > REVISION
	zip -r debug-dump-$(TIMESTAMP).zip REVISION tmp *.db *.db.digest
	rm REVISION
	@echo "Debug info dumped to debug-dump-$(TIMESTAMP).zip"
