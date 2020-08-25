from unittest.mock import patch

import pytest, json, io, os

from converter.SEMSoutput import process_results_file

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
SAMPLE_FILES = os.path.join(PARENT_DIR, 'sample_files')

TESTS = [
    {
        'election': 'general-election.json',
        'cvrs': '10_cvrs.csv',
        'sems': '10_expected-sems-results.txt'
    },
    {
        'election': '10_8-26-2020-expected-election.json',
        'cvrs': '10_8-26-2020-cvrs.txt',
        'sems': '10_8-26-2020-expected-sems-output.txt',
    }            
]

def get_sample_file(filename):
    return os.path.join(SAMPLE_FILES, filename)

def test_general_results():
    for test in TESTS:
        result = process_results_file(
            get_sample_file(test['election']),
            get_sample_file(test['cvrs']))

    expected_result_file = open(get_sample_file(test['sems']), "rb")
    expected_result = expected_result_file.read()

    assert result.encode('utf-8') == expected_result
