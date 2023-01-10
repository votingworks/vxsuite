
# a phony dependency that can be used as a dependency to force builds
FORCE:

# install any required dependencies here, i.e. `sudo apt install -y DEPS`
install:
	sudo apt install -y fdisk dosfstools exfat-utils

build: FORCE
	pnpm install && pnpm build

bootstrap: install build

run:
	cd prodserver && node index.js
