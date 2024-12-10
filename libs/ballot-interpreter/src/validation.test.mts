import { describe, expect, test } from 'vitest';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  BallotId,
  BallotStyleId,
  BallotType,
  DEFAULT_MARK_THRESHOLDS,
  PageInterpretation,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { normalizeBallotMode } from './validation.js';
import { InterpreterOptions } from './types.js';

const BLANK_INTERPRETATION: PageInterpretation = { type: 'BlankPage' };

function createMockInterpretation(spec: {
  isTestModeBallot: boolean;
}): PageInterpretation {
  return {
    type: 'InterpretedBmdPage',
    ballotId: 'abc' as BallotId,
    metadata: {
      ballotHash: 'hash',
      ballotType: BallotType.Precinct,
      ballotStyleId: '5' as BallotStyleId,
      precinctId: '21',
      isTestMode: spec.isTestModeBallot,
    },
    votes: {},
    adjudicationInfo: {
      requiresAdjudication: false,
      enabledReasons: [],
      enabledReasonInfos: [],
      ignoredReasonInfos: [],
    },
  };
}

function createInterpreterOptions(spec: {
  allowOfficialBallotsInTestMode: boolean;
  isTestModeInterpreter: boolean;
}) {
  const options: InterpreterOptions = {
    adjudicationReasons: [],
    allowOfficialBallotsInTestMode: spec.allowOfficialBallotsInTestMode,
    electionDefinition: electionGeneralDefinition,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    precinctSelection: ALL_PRECINCTS_SELECTION,
    testMode: spec.isTestModeInterpreter,
  };
  return options;
}

describe('normalizeBallotMode', () => {
  interface NormalizeBallotModeTestSpec {
    allowOfficialBallotsInTestMode: boolean;
    expectedOutputTestMode: boolean;
    isTestModeInterpreter: boolean;
    isTestModeBallot: boolean;
  }

  function testNormalization(spec: NormalizeBallotModeTestSpec) {
    const input = createMockInterpretation({
      isTestModeBallot: spec.isTestModeBallot,
    });
    const expectedOutput = createMockInterpretation({
      isTestModeBallot: spec.expectedOutputTestMode,
    });

    expect(normalizeBallotMode(input, createInterpreterOptions(spec))).toEqual(
      expectedOutput
    );
  }

  test('official interpreter, test-mode ballot', () => {
    const isTestModeInterpreter = false;
    const isTestModeBallot = true;
    const expectedOutputTestMode = true;

    testNormalization({
      allowOfficialBallotsInTestMode: false,
      isTestModeInterpreter,
      isTestModeBallot,
      expectedOutputTestMode,
    });

    testNormalization({
      allowOfficialBallotsInTestMode: true,
      isTestModeInterpreter,
      isTestModeBallot,
      expectedOutputTestMode,
    });
  });

  test('official interpreter, official ballot', () => {
    const isTestModeInterpreter = false;
    const isTestModeBallot = false;
    const expectedOutputTestMode = false;

    testNormalization({
      allowOfficialBallotsInTestMode: false,
      isTestModeInterpreter,
      isTestModeBallot,
      expectedOutputTestMode,
    });

    testNormalization({
      allowOfficialBallotsInTestMode: true,
      isTestModeInterpreter,
      isTestModeBallot,
      expectedOutputTestMode,
    });
  });

  test('test-mode interpreter, test-mode ballot', () => {
    const isTestModeInterpreter = true;
    const isTestModeBallot = true;
    const expectedOutputTestMode = true;

    testNormalization({
      allowOfficialBallotsInTestMode: false,
      isTestModeInterpreter,
      isTestModeBallot,
      expectedOutputTestMode,
    });

    testNormalization({
      allowOfficialBallotsInTestMode: true,
      isTestModeInterpreter,
      isTestModeBallot,
      expectedOutputTestMode,
    });
  });

  test('test-mode interpreter, official ballot, test-mode mismatches not allowed', () => {
    testNormalization({
      allowOfficialBallotsInTestMode: false,
      isTestModeInterpreter: true,
      isTestModeBallot: false,
      expectedOutputTestMode: false,
    });
  });

  test('test-mode interpreter, official ballot, test mode mismatches allowed', () => {
    testNormalization({
      allowOfficialBallotsInTestMode: true,
      isTestModeInterpreter: true,
      isTestModeBallot: false,
      expectedOutputTestMode: true,
    });
  });

  test('is no-op for interpretation with no metadata', () => {
    expect(
      normalizeBallotMode(
        BLANK_INTERPRETATION,
        createInterpreterOptions({
          allowOfficialBallotsInTestMode: true,
          isTestModeInterpreter: true,
        })
      )
    ).toEqual(BLANK_INTERPRETATION);
  });
});
