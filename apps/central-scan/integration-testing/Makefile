APP := ..
export PIPENV_VENV_IN_PROJECT=1
export SCAN_WORKSPACE=/tmp/central-scan-integration-testing
export MOCK_SCANNER_FILES=../../../libs/fixtures/data/electionGridLayoutNewHampshireTestBallot/scan-marked-front.jpeg,../../../libs/fixtures/data/electionGridLayoutNewHampshireTestBallot/scan-marked-back.jpeg

build-frontend:
	make -C $(APP)/frontend install; \
	make -C $(APP)/frontend build; \

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
