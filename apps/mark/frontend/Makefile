BACKEND := ../backend
SMARTCARDS := ../../../services/smartcards

# a phony dependency that can be used as a dependency to force builds
FORCE:

# install any required dependencies here, i.e. `sudo apt install -y DEPS`
install:

build-smartcards:
	make -C $(SMARTCARDS) install-smartcard; \
	make -C $(SMARTCARDS) build;

build-backend:
	make -C $(BACKEND) install; \
	make -C $(BACKEND) build; \

build-frontend: build

build-all: build-smartcards build-backend build-frontend

run-all: 
	(trap 'kill 0' SIGINT SIGHUP; make -C $(SMARTCARDS) run & make -C $(BACKEND) run & cd prodserver && node index.js)

build: FORCE
	pnpm install && pnpm build

bootstrap: install build

run:
	cd prodserver && node index.js
