#!/usr/bin/env python3

import base64
import os
import sys
import http.client
import json

# 1. read mock data from /mock endpoint
# 2. create fixture directory
# 3. write short value to short.json in fixture directory
# 4. if `longValueExists`, write long value to long.b64 in fixture directory


def fatal(error):
    print('error: %s' % error, file=sys.stderr)
    usage(file=sys.stderr, code=-1)


def usage(file=sys.stdout, code=0):
    argv0 = sys.argv[0]

    print('usage: %s FIXTURE' % argv0, file=file)
    print('', file=file)
    print('Creates FIXTURE directory and writes short and long value from current mock.', file=file)
    exit(code)


def write_fixture(fixture_path):
    create_fixture_directory(fixture_path)
    data = read_mock_data()

    short_value = base64.b64decode(data['shortValueB64']).decode('ascii')
    fixture_short_path = os.path.join(fixture_path, 'short.json')

    with open(fixture_short_path, 'w') as short_file:
        short_file.write(short_value)

    if 'longValueB64' in data and data['longValueB64'] is not None:
        long_value = data['longValueB64']
        fixture_long_path = os.path.join(fixture_path, 'long.b64')

        with open(fixture_long_path, 'w') as long_file:
            long_file.write(long_value)


def create_fixture_directory(fixture_directory):
    os.makedirs(fixture_directory, exist_ok=True)


def read_mock_data():
    client = http.client.HTTPConnection('localhost', 3001)
    client.request('GET', '/mock')
    return json.loads(client.getresponse().read())


def main():
    fixture_path = None

    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]

        if arg[0] == '-':
            fatal('unexpected flag: %s' % arg)
        elif fixture_path is not None:
            fatal('unexpected argument: %s' % arg)
        else:
            fixture_path = arg

        i += 1

    write_fixture(fixture_path)


main()
