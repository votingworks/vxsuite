# SmartCard Service

This web server component provides a web interface to a connected smartcard.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.
This service is intended to be run as part of an application stack and is used
by various frontends, not run on its own. To run it as part of an application,
first build this service and then run the appropriate application:

```sh
# in services/smartcards
make build

# in an app frontend, e.g. apps/admin/frontend
pnpm start
```

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
# Configure with system administrator card
./mockCardReader.py enable --system-administrator

# Configure with election manager card
./mockCardReader.py enable --election-manager /path/to/election.json

# Open polls with poll worker card
./mockCardReader.py enable --poll-worker /path/to/election.json
```

### Using fixtures

Use any fixture paths you like. This shows using the default fixtures:

```sh
# Configure with election manager card
./mockCardReader.py enable --fixture fixtures/election_manager

# Open polls with poll worker card
./mockCardReader.py enable --fixture fixtures/poll_worker
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
