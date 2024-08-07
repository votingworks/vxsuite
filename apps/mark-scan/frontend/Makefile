BACKEND := ../backend

# a phony dependency that can be used as a dependency to force builds
FORCE:

install:

build-backend:
	make -C $(BACKEND) install; \
	make -C $(BACKEND) build; \

build-frontend: build

build-all: build-backend build-frontend

run-all: 
	(trap 'kill 0' SIGINT SIGHUP; make -C $(BACKEND) run & cd prodserver && node index.js)

build: FORCE
	pnpm install && \
		pnpm --dir ../../../libs/ballot-interpreter build && \
		pnpm --dir ../backend build && \
		pnpm build

bootstrap: install build

run:
	cd prodserver && node index.js
