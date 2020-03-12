from unittest.mock import patch

import pytest, json, io, os

from converter.SEMSinput import main

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
FILES_DIR = os.path.join(PARENT_DIR, 'election_files')
SAMPLE_FILES = os.path.join(PARENT_DIR, 'sample_files')

TESTS = [
    {
        'main': '10_11-5-2019.txt',
        'candmap': '10_CANDMAP_11-5-2019.txt',
        'expected': '10_expected-election.json'
    },
    {
        'main': '10_3-10-2020.txt',
        'candmap': '10_CANDMAP_3-10-2020.txt',
        'expected': '10_3-10-2020-expected-election.json'
    }    
]

def get_sample_file(filename):
    return os.path.join(SAMPLE_FILES, filename)

def test_general_conversion():
    for test in TESTS:
        main_file = get_sample_file(test['main'])
        candmap_file = get_sample_file(test['candmap'])
        expected_file = get_sample_file(test['expected'])
        
        result = main(main_file, candmap_file)

        expected_result_file = open(expected_file, "r")
        expected_result = expected_result_file.read()

        assert result.strip() == expected_result.strip()
