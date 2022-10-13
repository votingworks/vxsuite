
add-ppa:
	apt-cache search --names-only "^python3.9$$" | grep python || sudo add-apt-repository -y ppa:deadsnakes/ppa # add deadsnakes only if we need to

install-python: add-ppa
	sudo apt install -y python3.9 python3.9-dev python3-distutils python3-pip

install: install-python

install-dependencies:
	python3.9 -m pip install pipenv --quiet
	python3.9 -m pipenv install

install-dev-dependencies:
	python3.9 -m pipenv install --dev

build: install-dependencies

test:
	python3.9 -m pipenv run python -m pytest

coverage:
	python3.9 -m pipenv run python3.9 -m pytest --cov=converter --cov-report term-missing --cov-fail-under=100 tests/

run:
	FLASK_APP=converter.core python3.9 -m pipenv run python -m flask run --port 3003
