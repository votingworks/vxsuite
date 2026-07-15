APP := ..
ROOT_ENV := $(APP)/../../.env
export PIPENV_VENV_IN_PROJECT=1
export SCAN_WORKSPACE=/tmp/central-scan-integration-testing
export REACT_APP_VX_ENABLE_DEV_DOCK=TRUE
export REACT_APP_VX_USE_MOCK_CENTRAL_SCANNER=TRUE

build-frontend:
	sed -i 's/REACT_APP_VX_ENABLE_BALLOT_PRINT_VALIDATOR=TRUE/REACT_APP_VX_ENABLE_BALLOT_PRINT_VALIDATOR=FALSE/' $(ROOT_ENV); \
	make -C $(APP)/frontend install && make -C $(APP)/frontend build; \
	status=$$?; \
	sed -i 's/REACT_APP_VX_ENABLE_BALLOT_PRINT_VALIDATOR=FALSE/REACT_APP_VX_ENABLE_BALLOT_PRINT_VALIDATOR=TRUE/' $(ROOT_ENV); \
	exit $$status

build-backend:
	make -C $(APP)/backend install; \
	make -C $(APP)/backend build; \

build: build-frontend build-backend

run:
	rm -rf $(SCAN_WORKSPACE)
	mkdir $(SCAN_WORKSPACE)
	NODE_ENV=production IS_INTEGRATION_TEST=true VX_MACHINE_TYPE=central-scan \
		./node_modules/.bin/concurrently -n frontend,backend --kill-others \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"
