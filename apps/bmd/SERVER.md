# VotingWorks BMD Server

When running on an actual voting machine in localhost mode, you should use this
simple server.

The instructions here are for Ubuntu Linux 18.04

## Install Requisite Software

```
sudo add-apt-repository ppa:deadsnakes/ppa
sudo make install-python
sudo make install-smartcard
make install-dependencies
pip3 install pipenv
cd server/
pipenv install
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
