from unittest.mock import patch

import pytest, json, io, os

from converter.SEMSinput import main

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
FILES_DIR = os.path.join(PARENT_DIR, 'election_files')
SAMPLE_FILES = os.path.join(PARENT_DIR, 'sample_files')

GENERAL_MAIN_FILE = os.path.join(SAMPLE_FILES, '10_11-5-2019.txt')
GENERAL_CANDIDATE_MAPPING_FILE = os.path.join(SAMPLE_FILES, '10_CANDMAP_11-5-2019.txt')
GENERAL_EXPECTED_ELECTION_FILE = os.path.join(SAMPLE_FILES, '10_expected-election.json')

def test_general_conversion():
    result = main(GENERAL_MAIN_FILE, GENERAL_CANDIDATE_MAPPING_FILE)

    expected_result_file = open(GENERAL_EXPECTED_ELECTION_FILE, "r")
    expected_result = expected_result_file.read()

    assert result.strip() == expected_result.strip()
