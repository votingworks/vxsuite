
install-dependencies:
	python3.9 -m pip install pipenv
	python3.9 -m pipenv install

install-dev-dependencies:
	python3.9 -m pipenv install --dev

build: install-dependencies

bootstrap: build install-dev-dependencies

test:
	python3.9 -m pipenv run python -m pytest

coverage:
	python3.9 -m pipenv run python3.9 -m pytest --cov=converter --cov-report term-missing --cov-fail-under=100 tests/

run:
	FLASK_APP=converter.core python3.9 -m pipenv run python -m flask run --port 3003
