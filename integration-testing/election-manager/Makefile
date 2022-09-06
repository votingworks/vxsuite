ELECTION_MANAGER := ../../frontends/election-manager
ADMIN := ../../services/admin
SMARTCARDS := ../../services/smartcards
SEMS := ../../services/converter-ms-sems
export PIPENV_VENV_IN_PROJECT=1

clean-downloads:
	rm cypress/downloads/*

build-election-manager:
	make -C $(ELECTION_MANAGER) build; \

build-admin:
	make -C $(ADMIN) install; \
	make -C $(ADMIN) build; \

build-converter-ms-sems:
	make -C $(SEMS) install-dependencies; \
	make -C $(SEMS) install-dev-dependencies; \
	make -C $(SEMS) build;

build-smartcards:
	make -C $(SMARTCARDS) install-smartcard; \
	make -C $(SMARTCARDS) build;


build: build-admin build-election-manager build-converter-ms-sems build-smartcards

run:
	(trap 'kill 0' SIGINT SIGHUP; make -C $(SMARTCARDS) run & make -C $(SEMS) run & make -C $(ADMIN) run & make -C $(ELECTION_MANAGER) run)

