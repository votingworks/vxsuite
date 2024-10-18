APP := ..
export ADMIN_WORKSPACE=/tmp/admin-integration-testing

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
