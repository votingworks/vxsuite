
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

build: install install-dependencies

test:
	python3 -m pytest

coverage:
	python3 -m pytest --cov=smartcards --cov-report term-missing --cov-fail-under=100 tests/

typecheck:
	python3 -m mypy smartcards tests

run:
	FLASK_APP=smartcards.core python3 -m pipenv run python -m flask run --port 3001