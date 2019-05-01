
install-python:
	apt install python3.7 python3.7-dev

install-smartcard:
	apt install libusb-1.0-0-dev libpcsclite-dev pcscd pcsc-tools swig

install-dependencies:
	pip3 install pipenv
	pipenv install

install-dev-dependencies:
	pipenv install --dev

test:
	python -m pytest

coverage:
	python -m pytest --cov=bmdserver --cov-report term-missing --cov-fail-under=100 tests/

run:
	FLASK_APP=bmdserver.core python -m flask run --port 3000
