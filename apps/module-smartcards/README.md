# SmartCard Module

This web server component provides a web interface to a connected smartcard.

## Prerequisites

The instructions below show how to run this web server either directly or via Docker. If you wish to use Docker, make sure both [`docker`](https://docs.docker.com/install/) and [`docker-compose`](https://docs.docker.com/compose/install/) are installed. Otherwise the instructions assume you're running in [Ubuntu](http://ubuntu.com), though other systems such as macOS work with appropriate changes.

> **Note:** While using Docker is a great way to get this running with mock data for developing BMD, it's not straightforward to use Docker with real hardware. You can use both development approaches interchangeably, so pick the one that is most appropriate to the task at hand.

## Install Requisite Software

```sh
# without docker only -- docker handles this for you
sudo add-apt-repository ppa:deadsnakes/ppa
make install
make build
```

## Run Tests

Install dependencies you need

```sh
# without docker only -- docker handles this for you
make build-dev
```

and then run the tests

```sh
# without docker
make test

# with docker
docker-compose run server-tests make test
```

With code coverage

```sh
# without docker
make coverage

# with docker
docker-compose run server-tests make coverage
```

## Start the Development Server

The server will be available at http://localhost:3001/.

```sh
# without docker
make run

# with docker
docker-compose up
```

## Mock a Smart Card

Once you're running the server, you can enable a mock card reader with fixture data as in the examples below. Check out the [`fixtures/`](./fixtures) directory for what mock cards are available.

### Voter

```
./mockCardReader.py enable --fixture fixtures/voter
```

### Poll Worker

```
./mockCardReader.py enable --fixture fixtures/pollworker
```

### Clerk

```
./mockCardReader.py enable --fixture fixtures/admin
```

### Blank Card

```
./mockCardReader.py enable --fixture fixtures/blank
```

### No Card

```
./mockCardReader.py enable --no-card
```
