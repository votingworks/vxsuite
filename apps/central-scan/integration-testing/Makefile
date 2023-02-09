APP := ..
SMARTCARDS := ../../../services/smartcards
export PIPENV_VENV_IN_PROJECT=1
export SCAN_WORKSPACE=/tmp/central-scan-integration-testing
export MOCK_SCANNER_FILES=../../../libs/fixtures/data/electionFamousNames2021/sample-ballot-undervotes-p1.jpeg,../../../libs/fixtures/data/electionFamousNames2021/sample-ballot-undervotes-p2.jpeg

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
	export NODE_ENV=production
	rm -rf $(SCAN_WORKSPACE)
	mkdir $(SCAN_WORKSPACE)
	./node_modules/.bin/concurrently -n smartcards,frontend,backend --kill-others \
		"make -C ${SMARTCARDS} run" \
		"make -C $(APP)/frontend run" \
		"make -C $(APP)/backend run"

