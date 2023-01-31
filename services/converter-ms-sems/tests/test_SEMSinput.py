from unittest.mock import patch

import json
import io
import os

from converter.SEMSinput import main

PARENT_DIR = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..')
SAMPLE_FILES = os.path.join(PARENT_DIR, 'sample_files')

TESTS = [
    {
        'main': '10_11-5-2019.txt',
        'candmap': '10_CANDMAP_11-5-2019.txt',
    },
    {
        'main': '10_3-10-2020.txt',
        'candmap': '10_CANDMAP_3-10-2020.txt',
    },
    {
        'main': '10_9-22-2020.txt',
        'candmap': '10_CANDMAP_9-22-2020.txt',
    },
    {
        'main': '10_8-26-2020.txt',
        'candmap': '10_CANDMAP_8-26-2020.txt',
    }        
]


def get_sample_file(filename):
    return os.path.join(SAMPLE_FILES, filename)

def test_general_conversion(snapshot):
    for test in TESTS:
        main_file = get_sample_file(test['main'])
        candmap_file = get_sample_file(test['candmap'])
        
        result = main(main_file, candmap_file)
        snapshot.assert_match(result)
