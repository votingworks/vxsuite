#!/usr/bin/env python3

import base64
import hashlib
import http.client
import json
import sys
import os
import re
import time
from typing import Optional


def fatal(error):
    print("error: %s" % error, file=sys.stderr)
    usage(file=sys.stderr, code=-1)


def usage(file=sys.stdout, code=0):
    argv0 = sys.argv[0]

    print("usage: %s COMMAND [OPTIONS]" % argv0, file=file)
    print("", file=file)
    print("# enable mock reader but without a card", file=file)
    print("%s enable --no-card" % argv0, file=file)
    print("", file=file)
    print(
        "# enable mock reader with a card but do not set long/short values", file=file
    )
    print("%s enable" % argv0, file=file)
    print("", file=file)
    print(
        "# enable mock reader with a card of a certain type for an election definition",
        file=file,
    )
    print("%s enable --admin DEFINITION" % argv0, file=file)
    print("%s enable --pollworker DEFINITION" % argv0, file=file)
    print(
        "%s enable --voter DEFINITION --precinct PRECINCT_ID --ballot-style BALLOT_STYLE_ID"
        % argv0,
        file=file,
    )
    print("", file=file)
    print(
        "# enable mock reader with a card and set long/short values from fixture data",
        file=file,
    )
    print("%s enable --fixture DIR" % argv0, file=file)
    print("", file=file)
    print("# disable mock reader / use the real card reader", file=file)
    print("%s disable" % argv0, file=file)
    exit(code)


def set_mock(request_data):
    client = http.client.HTTPConnection("localhost", 3001)
    client.request("PUT", "/mock", json.dumps(request_data))
    response = client.getresponse()

    print(response.read().decode("utf-8"))


def enable_no_card():
    set_mock({"enabled": True, "hasCard": card})


def enable_fixture(fixture_path: str):
    if os.path.isfile(fixture_path):
        fatal(
            "You provided a file for FIXTURE instead of a directory: %s." % fixture_path
        )
        exit(-1)

    fixture_short_path = os.path.join(fixture_path, "short.json")
    fixture_long_path_json = os.path.join(fixture_path, "long.json")
    fixture_long_path_b64 = os.path.join(fixture_path, "long.b64")

    if not os.path.exists(fixture_short_path):
        fatal("Expected a short value at %s." % fixture_short_path)

    request_data = {
        "enabled": True,
    }

    long_value_hash: Optional[str] = None
    if os.path.exists(fixture_long_path_json):
        with open(fixture_long_path_json, "r") as long_file:
            request_data["longValue"] = long_file.read()
            long_value_hash = hashlib.sha256(
                request_data["longValue"].encode("utf-8")
            ).hexdigest()
    elif os.path.exists(fixture_long_path_b64):
        with open(fixture_long_path_b64, "r") as long_file:
            request_data["longValueB64"] = long_file.read()
            long_value_hash = hashlib.sha256(
                base64.b64decode(request_data["longValue"])
            ).hexdigest()
    else:
        request_data["longValue"] = None

    with open(fixture_short_path, "r") as short_file:
        request_data["shortValue"] = re.sub(
            r"{{hash\(long\)}}",
            long_value_hash or "",
            re.sub(r"\"{{now}}\"", str(round(time.time())), short_file.read()),
        )

    print(request_data)
    set_mock(request_data)


class ElectionDefinition(object):
    def __init__(self, election_data: str):
        hasher = hashlib.sha256()
        hasher.update(bytes(election_data, "utf-8"))
        self.election_hash = hasher.hexdigest()
        self.election_data = election_data
        self.election = json.loads(election_data)


def enable_admin(election_definition: ElectionDefinition):
    set_mock(
        {
            "enabled": True,
            "shortValue": json.dumps(
                {"t": "admin", "h": election_definition.election_hash}
            ),
            "longValue": election_definition.election_data,
        }
    )


def enable_pollworker(election_definition: ElectionDefinition):
    set_mock(
        {
            "enabled": True,
            "shortValue": json.dumps(
                {"t": "pollworker", "h": election_definition.election_hash}
            ),
            "longValue": election_definition.election_data,
        }
    )


def enable_voter(
    election_definition: ElectionDefinition,
    precinct_id: str,
    ballot_style_id: str,
):
    set_mock(
        {
            "enabled": True,
            "shortValue": json.dumps(
                {
                    "t": card_type,
                    "pr": precinct_id,
                    "bs": ballot_style_id,
                    "c": str(round(time.time())),
                }
            ),
            "longValue": None,
        }
    )


def disable():
    set_mock({"enabled": False})


if len(sys.argv) < 2:
    usage(file=sys.stderr, code=-1)

command = sys.argv[1]

if command == "enable":
    card = True
    fixture_path: Optional[str] = None
    election_path: Optional[str] = None
    card_type: Optional[str] = None
    precinct_id: Optional[str] = None
    ballot_style_id: Optional[str] = None

    i = 2
    while i < len(sys.argv):
        arg = sys.argv[i]

        if arg == "--card" or arg == "--no-card":
            card = arg == "--card"
        elif arg == "--fixture":
            i += 1
            fixture_path = sys.argv[i]
        elif arg == "--admin":
            i += 1
            election_path = sys.argv[i]
            card_type = "admin"
        elif arg == "--pollworker":
            i += 1
            election_path = sys.argv[i]
            card_type = "pollworker"
        elif arg == "--voter":
            i += 1
            election_path = sys.argv[i]
            card_type = "voter"
        elif arg == "--precinct":
            i += 1
            precinct_id = sys.argv[i]
        elif arg == "--ballot-style":
            i += 1
            ballot_style_id = sys.argv[i]
        else:
            fatal("unexpected option: %s" % arg)

        i += 1

    if fixture_path:
        if card_type:
            fatal("cannot provide both --fixture and --%s" % card_type)
        enable_fixture(fixture_path)
    elif election_path:
        if not os.path.isfile(election_path):
            fatal("Election definition path is not a file: %s." % election_path)
            exit(-1)

        with open(election_path, "r") as election_file:
            election_data = election_file.read()

        election_definition = ElectionDefinition(election_data)
        if card_type == "admin":
            enable_admin(election_definition)
        elif card_type == "pollworker":
            enable_pollworker(election_definition)
        elif card_type == "voter":
            if not precinct_id:
                fatal("--voter requires --precinct")
            if not ballot_style_id:
                fatal("--voter requires --ballot-style")

            enable_voter(election_definition, precinct_id, ballot_style_id)
    else:
        enable_no_card()

elif command == "disable":
    disable()
elif command == "help":
    usage()
else:
    fatal("unknown command: %s" % command)
