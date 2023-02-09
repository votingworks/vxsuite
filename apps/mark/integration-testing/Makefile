APP := ..
SMARTCARDS := ../../../services/smartcards
export PIPENV_VENV_IN_PROJECT=1

clean-downloads:
	rm cypress/downloads/*

build-frontend:
	make -C $(APP)/frontend install; \
	make -C $(APP)/frontend build; \

build-backend:
	make -C $(APP)/backend install; \
	make -C $(APP)/backend build; \

build-smartcards:
	make -C $(SMARTCARDS) install-smartcard; \
	make -C $(SMARTCARDS) build;

build: build-frontend build-backend build-smartcards

run:
	export NODE_ENV=production
	./node_modules/.bin/concurrently -n smartcards,frontend,backend --kill-others \
		"make -C ${SMARTCARDS} run" \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"
