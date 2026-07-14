APP := ..
export ADMIN_WORKSPACE=/tmp/admin-integration-testing

# Load and export environment variables from this package's .env file so they
# take precedence over any .env.local overrides in the frontend/backend
# packages when running locally.
include .env
export

build:
	# building the frontend builds the backend too
	make -C $(APP)/frontend install; \
	make -C $(APP)/frontend build

run:
	rm -rf $(ADMIN_WORKSPACE)
	mkdir $(ADMIN_WORKSPACE)
	NODE_ENV=production IS_INTEGRATION_TEST=true VX_MACHINE_TYPE=admin \
		./node_modules/.bin/concurrently -n frontend,backend --kill-others \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"
