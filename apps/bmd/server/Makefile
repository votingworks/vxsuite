
test:
	python -m pytest

coverage:
	python -m pytest --cov=bmdserver --cov-report term-missing --cov-fail-under=100 tests/

run:
	FLASK_APP=bmdserver.core python -m flask run --port 3000
