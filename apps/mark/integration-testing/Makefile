APP := ..
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

build: build-frontend build-backend

run:
	rm -rf $(MARK_WORKSPACE)
	mkdir $(MARK_WORKSPACE)
	NODE_ENV=production IS_INTEGRATION_TEST=true VX_MACHINE_TYPE=mark \
		./node_modules/.bin/concurrently -n frontend,backend --kill-others \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"
