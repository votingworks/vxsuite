# SmartCard Service

This web server component provides a web interface to a connected smartcard.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then run the service like so:

```sh
# in services/smartcards
make build
make run
```

The server will be available at http://localhost:3001/.

## Install Requisite Software

```sh
make install
make build
```

## Testing

Install dependencies you need:

```sh
make build-dev
```

and then run the tests:

```sh
make test
```

With code coverage:

```sh
make coverage
```

## Mock a Smart Card

Once you're running the server, you can enable a mock card reader with fixture
data as in the examples below. Supply your own election definition, or use one
of the existing [`fixtures/`](./fixtures).

### Using your own election definition

```sh
# configure with admin card
./mockCardReader.py enable --admin /path/to/election.json
# open polls with poll worker card
./mockCardReader.py enable --pollworker /path/to/election.json
# vote with voter card
./mockCardReader.py enable --voter /path/to/election.json --precinct 123 --ballot-style 1R
```

### Using fixtures

Use any fixture paths you like. This shows using the default fixtures:

```sh
# configure with admin card
./mockCardReader.py enable --fixture fixtures/admin
# open polls with poll worker card
./mockCardReader.py enable --fixture fixtures/pollworker
# vote with voter card
./mockCardReader.py enable --fixture fixtures/voter
```

### Blank Card

```sh
./mockCardReader.py enable --fixture fixtures/blank
```

### No Card

```sh
./mockCardReader.py enable --no-card
```

## Card Reader QA

To verify that a card reader works correctly, run:

```sh
pipenv run python testCardReader.py
```

## Other Resources

- [HID OMNIKEY SmartCard Reader Documentation](./plt-03099_a.5_-_omnikey_sw_dev_guide_0.pdf)

## License

GPLv3
