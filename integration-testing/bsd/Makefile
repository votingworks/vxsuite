BSD := ../../apps/bsd
SCAN := ../../apps/module-scan
export PIPENV_VENV_IN_PROJECT=1
export MODULE_SCAN_WORKSPACE=/tmp
export MOCK_SCANNER_FILES=,,

build-bsd:
	make -C $(BSD) build; \

build-scan:
	make -C $(SCAN) install; \
	make -C $(SCAN) build; \


build: build-scan build-bsd

run:
	export NODE_ENV=production
	(trap 'kill 0' SIGINT SIGHUP; make -C $(SCAN) run & make -C $(BSD) run)

