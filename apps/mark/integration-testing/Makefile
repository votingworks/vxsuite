APP := ..
SMARTCARDS := ../../../services/smartcards
export PIPENV_VENV_IN_PROJECT=1
export MARK_WORKSPACE=/tmp/mark-integration-testing

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
	rm -rf $(MARK_WORKSPACE)
	mkdir $(MARK_WORKSPACE)
	NODE_ENV=production IS_INTEGRATION_TEST=true ./node_modules/.bin/concurrently -n smartcards,frontend,backend --kill-others \
		"make -C ${SMARTCARDS} run" \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"
