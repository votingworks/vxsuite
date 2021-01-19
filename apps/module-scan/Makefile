PLATFORM := $(shell uname)
TIMESTAMP := $(shell date --iso-8601=seconds --utc | sed 's/+.*$\//g' | tr ':' '-')

# a phony dependency that can be used as a dependency to force builds
FORCE:

install:
ifeq ($(PLATFORM),Darwin)
	brew install libjpeg libpng
else ifeq ($(PLATFORM),Linux)
	sudo apt install -y build-essential libx11-dev libjpeg-dev libpng-dev
else
	@echo "I don't know how to install libjpeg and libpng on your platform: $(PLATFORM)"
endif

build: FORCE
	pnpm install

run:
	pnpm start

debug-dump:
	git rev-parse HEAD > REVISION
	zip -r debug-dump-$(TIMESTAMP).zip REVISION tmp *.db *.db.digest
	rm REVISION
	@echo "Debug info dumped to debug-dump-$(TIMESTAMP).zip"
