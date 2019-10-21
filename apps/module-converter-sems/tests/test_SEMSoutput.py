from unittest.mock import patch

import pytest, json, io, os

from converter.SEMSoutput import process_results_file

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
SAMPLE_FILES = os.path.join(PARENT_DIR, 'sample_files')

GENERAL_ELECTION_FILE = os.path.join(SAMPLE_FILES, 'general-election.json')
GENERAL_CVR_FILE = os.path.join(SAMPLE_FILES, '10_cvrs.csv')
GENERAL_EXPECTED_SEMS_RESULTS_FILE = os.path.join(SAMPLE_FILES, '10_expected-sems-results.txt')

def test_general_results():
    result = process_results_file(GENERAL_ELECTION_FILE, GENERAL_CVR_FILE)

    expected_result_file = open(GENERAL_EXPECTED_SEMS_RESULTS_FILE, "rb")
    expected_result = expected_result_file.read().decode('utf-8')

    assert result == expected_result
