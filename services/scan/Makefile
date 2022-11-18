NODE_ENV ?= development
OS := $(shell lsb_release -cs)
TIMESTAMP := $(shell date --iso-8601=seconds --utc | sed 's/+.*$\//g' | tr ':' '-')

# a phony dependency that can be used as a dependency to force builds
FORCE:

install:
	sudo apt-get -y update
ifeq ($(OS),bionic)
	sudo apt-get install -y libsane build-essential libx11-dev libjpeg-dev libpng-dev
endif
ifeq ($(OS),focal)
	sudo apt install -y libsane build-essential libpixman-1-dev libcairo2-dev libpango1.0-dev libjpeg8-dev libgif-dev
endif
ifeq ($(OS),bullseye)
	sudo apt install -y libsane libpng-dev libjpeg-dev libx11-dev libpixman-1-dev libcairo2-dev libpango1.0-dev libgif-dev 
endif

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
