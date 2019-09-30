
install-python:
	apt install -y python3.7 python3.7-dev python3-pip

install-smartcard:
	apt install -y libusb-1.0-0-dev libpcsclite-dev pcscd pcsc-tools swig

install: install-python install-smartcard

install-dependencies:
	python3 -m pip install pipenv
	python3 -m pipenv install

install-dev-dependencies:
	python3 -m pipenv install --dev

build: install-dependencies

test:
	python3 -m pytest

coverage:
	python3 -m pytest --cov=smartcards --cov-report term-missing --cov-fail-under=100 tests/

run:
	FLASK_APP=smartcards.core python3 -m pipenv run python -m flask run --port 3001

mock:
	FLASK_APP=smartcards.core MOCK_SHORT_VALUE="{\"t\":\"clerk\",\"h\":\"blah\"}" MOCK_LONG_VALUE_FILE="tests/electionSample.json" pipenv run python -m flask run --port 3001
