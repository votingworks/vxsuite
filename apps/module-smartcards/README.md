# SmartCard Module

This web server component provides a web interface to a connected smartcard.

## Install Requisite Software

```
sudo add-apt-repository ppa:deadsnakes/ppa
sudo make install-python
sudo make install-smartcard
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

Make sure you're in the `server/` directory

```
pipenv shell
make run
```
