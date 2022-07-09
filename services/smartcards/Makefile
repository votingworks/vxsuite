
add-ppa:
	apt-cache search --names-only "^python3.9$$" | grep python || sudo add-apt-repository -y ppa:deadsnakes/ppa # add deadsnakes only if we need to

install-python: add-ppa
	sudo apt install -y python3.9 python3.9-dev python3.9-distutils python3-pip

install-smartcard:
	sudo apt install -y libusb-1.0-0-dev libpcsclite-dev pcscd pcsc-tools swig

install: install-python install-smartcard

build:
	python3.9 -m pip install pipenv
	python3.9 -m pipenv install

build-dev:
	python3.9 -m pipenv install --dev

test:
	python3.9 -m pipenv run python -m pytest

coverage:
	python3.9 -m pipenv run python -m pytest --cov=smartcards --cov-report term-missing --cov-fail-under=100 tests/

typecheck:
	python3.9 -m pipenv run python -m mypy smartcards tests

check-format:
	pipenv run autopep8 --exit-code -r -d .

format:
	python3.9 -m pipenv run autopep8 -i -r .

run:
	FLASK_APP=smartcards.core python3.9 -m pipenv run python -m flask run --port 3001 --host 0.0.0.0
