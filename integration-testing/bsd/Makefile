BSD := ../../apps/bsd
SCAN := ../../apps/module-scan
SMARTCARDS := ../../apps/module-smartcards
export PIPENV_VENV_IN_PROJECT=1
export MODULE_SCAN_WORKSPACE=/tmp
export BYPASS_AUTHENTICATION=true
export MOCK_SCANNER_FILES=test/fixtures/hamilton-seal-049e9e66cd/sample-ballot-undervotes_Page_1.png,test/fixtures/hamilton-seal-049e9e66cd/sample-ballot-undervotes_Page_2.png

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

