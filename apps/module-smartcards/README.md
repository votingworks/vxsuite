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

You can run the service with a mocked smart card as follows:

```
MOCK_SHORT_VALUE="<short_value_json>" MOCK_LONG_VALUE_FILE="<path_to_file>" make run
```

If using the `tests/electionSample.json` file, you may use the following commands:

### Voter
This will interpolate the current unix time stamp in seconds as the value of `c`.
```
MOCK_SHORT_VALUE="{\"t\":\"voter\",\"bs\":\"12\",\"pr\":\"23\",\"c\":$(date +%s)}" make run
```

### Poll Worker
```
MOCK_SHORT_VALUE="{\"t\":\"pollworker\",\"h\":\"blah\"}" make run
```

### Clerk
```
MOCK_SHORT_VALUE="{\"t\":\"clerk\",\"h\":\"blah\"}" MOCK_LONG_VALUE_FILE="tests/electionSample.json" make run
```
