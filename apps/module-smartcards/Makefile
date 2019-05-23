
install-python:
	apt install python3.7 python3.7-dev

install-smartcard:
	apt install libusb-1.0-0-dev libpcsclite-dev pcscd pcsc-tools swig

install-dependencies:
	python3 -m pip install pipenv
	python3 -m pipenv install

install-dev-dependencies:
	python3 -m pipenv install --dev

test:
	python -m pytest

coverage:
	python -m pytest --cov=smartcards --cov-report term-missing --cov-fail-under=100 tests/

run:
	FLASK_APP=smartcards.core python -m flask run --port 3001

mock:
	FLASK_APP=smartcards.core MOCK_SHORT_VALUE="{\"t\":\"clerk\",\"h\":\"blah\"}" MOCK_LONG_VALUE_FILE="tests/electionSample.json" python -m flask run --port 3001
