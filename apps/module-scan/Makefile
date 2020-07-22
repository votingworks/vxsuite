PLATFORM := $(shell uname)

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
	yarn install

run:
	yarn start
