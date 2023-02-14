
install: ;

build:
	python3.9 -m pip install pipenv
	python3.9 -m pipenv install

bootstrap: install build

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
