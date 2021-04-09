from unittest.mock import patch

import pytest, json, io, os

from converter.SEMSoutput import process_results_file, process_tallies_file

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
SAMPLE_FILES = os.path.join(PARENT_DIR, 'sample_files')

TESTS = [
    {
        'election': 'general-election.json',
        'cvrs': '10_cvrs.csv',
        'tallies': '10_tallies.json',
        'sems': '10_expected-sems-results.txt'
    },
    {
        'election': '10_8-26-2020-expected-election.json',
        'cvrs': '10_8-26-2020-cvrs.txt',
        'tallies': '10_8-26-2020-tallies.json',
        'sems': '10_8-26-2020-expected-sems-output.txt',
    },
    {
        'election': '10_8-26-2020-expected-election.json',
        'cvrs': '10_8-26-2020-b-cvrs.txt',
        'tallies': '10_8-26-2020-b-tallies.json',
        'sems': '10_8-26-2020-b-expected-sems-output.txt',
    },
    {
        'election': 'electionPrimarySample.json',
        'cvrs': 'election-primary-sample-cvrs.txt',
        'tallies': 'election-primary-sample-tallies.json',
        'sems': 'election-primary-expected-results.csv',
    }
]

def get_sample_file(filename):
    return os.path.join(SAMPLE_FILES, filename)

def test_general_results():
    for test in TESTS:
        print("testing", test)
        result = process_results_file(
            get_sample_file(test['election']),
            get_sample_file(test['cvrs']))

        expected_result_file = open(get_sample_file(test['sems']), "rb")
        expected_result = expected_result_file.read()
        
        assert result.encode('utf-8') == expected_result

def test_general_results_from_tallies():
    for test in TESTS:
        print("testing", test)
        result = process_tallies_file(
            get_sample_file(test['election']),
            get_sample_file(test['tallies']))

        expected_result_file = open(get_sample_file(test['sems']), "rb")
        expected_result = expected_result_file.read()

        assert result.encode('utf-8') == expected_result
