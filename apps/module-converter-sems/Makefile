
install-python:
	apt install python3.7 python3.7-dev python3-pip

install: install-python

install-dependencies:
	python3 -m pip install pipenv
	python3 -m pipenv install

install-dev-dependencies:
	python3 -m pipenv install --dev

build: install-dependencies

test:
	pipenv run python -m pytest

coverage:
	pipenv run python -m pytest --cov=converter --cov-report term-missing --cov-fail-under=100 tests/

run:
	FLASK_APP=converter.core pipenv run python -m flask run --port 3003
