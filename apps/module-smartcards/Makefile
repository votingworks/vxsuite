
install-python:
	sudo apt install -y python3.7 python3.7-dev python3-pip
	python3 -m pip install pipenv

install-smartcard:
	sudo apt install -y libusb-1.0-0-dev libpcsclite-dev pcscd pcsc-tools swig

install: install-python install-smartcard

build:
	python3 -m pipenv install

build-dev:
	python3 -m pipenv install --dev

test:
	python3 -m pipenv run python -m pytest

coverage:
	python3 -m pipenv run python -m pytest --cov=smartcards --cov-report term-missing --cov-fail-under=100 tests/

typecheck:
	python3 -m pipenv run python -m mypy smartcards tests

run:
	FLASK_APP=smartcards.core python3 -m pipenv run python -m flask run --port 3001 --host 0.0.0.0
