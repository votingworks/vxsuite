# SmartCard Module

This web server component provides a web interface to a connected smartcard.

## Install Requisite Software

```
sudo add-apt-repository ppa:deadsnakes/ppa

sudo make install
make build
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
make run
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
./mockCardReader.py enable --fixture fixtures/clerk
```
