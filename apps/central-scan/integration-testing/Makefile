APP := ..
export PIPENV_VENV_IN_PROJECT=1
export SCAN_WORKSPACE=/tmp/central-scan-integration-testing
export MOCK_SCANNER_FILES=../../../libs/fixtures/data/electionFamousNames2021/sample-ballot-undervotes-p1.jpeg,../../../libs/fixtures/data/electionFamousNames2021/sample-ballot-undervotes-p2.jpeg

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
	NODE_ENV=production IS_INTEGRATION_TEST=true ./node_modules/.bin/concurrently -n frontend,backend --kill-others \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"
