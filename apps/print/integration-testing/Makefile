APP := ..
export PIPENV_VENV_IN_PROJECT=1
export PRINT_WORKSPACE=/tmp/print-integration-testing

# Load and export environment variables from this package's .env file so they
# take precedence over any .env.local overrides in the frontend/backend
# packages when running locally.
include .env
export

build-frontend:
	make -C $(APP)/frontend install; \
	make -C $(APP)/frontend build; \

build-backend:
	make -C $(APP)/backend install; \
	make -C $(APP)/backend build; \

build: build-frontend build-backend

run:
	rm -rf $(PRINT_WORKSPACE)
	mkdir $(PRINT_WORKSPACE)
	NODE_ENV=production IS_INTEGRATION_TEST=true VX_MACHINE_TYPE=print \
		./node_modules/.bin/concurrently -n frontend,backend --kill-others \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"
