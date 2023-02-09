APP := ..
SMARTCARDS := ../../../services/smartcards
SEMS := ../../../services/converter-ms-sems
export PIPENV_VENV_IN_PROJECT=1

clean-downloads:
	rm cypress/downloads/*

build-frontend:
	make -C $(APP)/frontend install; \
	make -C $(APP)/frontend build; \

build-backend:
	make -C $(APP)/backend install; \
	make -C $(APP)/backend build; \

build-converter-ms-sems:
	make -C $(SEMS) install-dependencies; \
	make -C $(SEMS) install-dev-dependencies; \
	make -C $(SEMS) build;

build-smartcards:
	make -C $(SMARTCARDS) install-smartcard; \
	make -C $(SMARTCARDS) build;

build: build-frontend build-backend build-converter-ms-sems build-smartcards

run:
	./node_modules/.bin/concurrently -n smartcards,sems,frontend,backend --kill-others \
		"make -C ${SMARTCARDS} run" \
		"make -C $(SEMS) run" \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"
