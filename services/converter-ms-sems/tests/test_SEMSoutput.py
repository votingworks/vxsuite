import tempfile
from unittest.mock import patch

import json, io, os

from converter.SEMSoutput import process_tallies_file
from converter import SEMSinput

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
SAMPLE_FILES = os.path.join(PARENT_DIR, 'sample_files')

def get_sample_file(filename):
    return os.path.join(SAMPLE_FILES, filename)

def test_general_results_from_tallies(snapshot):
    with tempfile.NamedTemporaryFile('w') as election_file:
        election = SEMSinput.main(
            get_sample_file('10_8-26-2020.txt'),
            get_sample_file('10_CANDMAP_8-26-2020.txt')
        )
        election_file.write(election)

        TESTS = [
            {
                'election': get_sample_file('general-election.json'),
                'tallies': '10_tallies.json',
            },
            {
                'election': election_file.name,
                'tallies': '10_8-26-2020-tallies.json',
            },
            {
                'election': election_file.name,
                'tallies': '10_8-26-2020-b-tallies.json',
            },
            {
                'election': get_sample_file('electionPrimarySample.json'),
                'tallies': 'election-primary-sample-tallies.json',
            }
        ]

        for test in TESTS:
            result = process_tallies_file(
                test['election'],
                get_sample_file(test['tallies']))
            snapshot.assert_match(result)

