
from unittest.mock import patch
import pytest, json, io, os

from converter.combineSEMSresults import main

FILE1_PATH = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'sampleResults.txt')
FILE2_PATH = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'sampleResults_vx.txt')
COMPUTED_RESULTS_PATH = os.path.join(os.path.dirname(os.path.realpath(__file__)), '_computedResults.txt')
EXPECTED_RESULTS_PATH = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'expectedCombinedResults.txt')

def test_combination():
    try:
        os.unlink(COMPUTED_RESULTS_PATH)
    except:
        pass

    main(FILE1_PATH, FILE2_PATH, COMPUTED_RESULTS_PATH)

    # need to diff the files here
    assert False

    try:
        os.unlink(COMPUTED_RESULTS_PATH)
    except:
        pass
    
