APP := ..
export ADMIN_WORKSPACE=/tmp/admin-integration-testing

# A second VxAdmin instance running in adjudication-station (client) mode, used
# by the client-mode screenshot suite. It runs on its own ports (frontend 3100,
# backend 3101) so it can coexist with the default host instance (3000/3001).
CLIENT_WORKSPACE := /tmp/admin-integration-testing-client
CLIENT_FRONTEND_PORT := 3100

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

run-client:
	rm -rf $(CLIENT_WORKSPACE)
	mkdir $(CLIENT_WORKSPACE)
	printf 'client' > $(CLIENT_WORKSPACE)/machine_mode
	NODE_ENV=production IS_INTEGRATION_TEST=true VX_MACHINE_TYPE=admin \
	REACT_APP_VX_ENABLE_MULTI_STATION_ADMIN=TRUE FRONTEND_PORT=$(CLIENT_FRONTEND_PORT) \
		./node_modules/.bin/concurrently -n client-frontend,client-backend --kill-others \
		"FRONTEND_PORT=$(CLIENT_FRONTEND_PORT) make -C $(APP)/frontend run" \
		"FRONTEND_PORT=$(CLIENT_FRONTEND_PORT) ADMIN_WORKSPACE=$(CLIENT_WORKSPACE) make -C $(APP)/backend run"
