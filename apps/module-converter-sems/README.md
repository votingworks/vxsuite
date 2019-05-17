# SEMS Converter Module 

This web server component provides a web interface to convert files for Mississippi's SEMS.

## Install Requisite Software

```
sudo add-apt-repository ppa:deadsnakes/ppa
sudo make install-python
make install-dependencies
```

## Run Tests

Install dependencies you need

```
make install-dev-dependencies
```

and then run the tests

```
make test
```

With code coverage

```
make coverage
```

## Start the Development Server

```
pipenv shell
make run
```

## API

* `POST /convert/election` converts SEMS election files to a Vx Election File
* `POST /convert/results` converts Vx CVRs to a SEMS result file
