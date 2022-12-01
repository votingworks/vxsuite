BSD := ../../frontends/bsd
SCAN := ../../services/scan
SMARTCARDS := ../../services/smartcards
export PIPENV_VENV_IN_PROJECT=1
export SCAN_WORKSPACE=/tmp
export MOCK_SCANNER_FILES=../../libs/fixtures/data/electionFamousNames2021/sample-ballot-undervotes-p1.jpeg,../../libs/fixtures/data/electionFamousNames2021/sample-ballot-undervotes-p2.jpeg

build-bsd:
	make -C $(BSD) build; \

build-scan:
	make -C $(SCAN) install; \
	make -C $(SCAN) build; \

build-smartcards:
	make -C $(SMARTCARDS) install-smartcard; \
        make -C $(SMARTCARDS) build;

build: build-scan build-bsd build-smartcards

run:
	export NODE_ENV=production
	(trap 'kill 0' SIGINT SIGHUP; make -C $(SMARTCARDS) run & make -C $(SCAN) run & make -C $(BSD) run)

