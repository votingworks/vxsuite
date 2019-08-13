PLATFORM := $(shell uname)

# a phony dependency that can be used as a dependency to force builds
FORCE:

install:
ifeq ($(PLATFORM),Darwin)
	brew install zbar
else ifeq ($(PLATFORM),Linux)
	apt install zbar-tools
else
	@echo "zbar cannot be installed on unknown platform: $(PLATFORM)"
endif

build: FORCE
	yarn install

run:
	yarn start
