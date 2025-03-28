import { describe, expect, test } from 'vitest';
import {
  BallotStyle as VxfBallotStyle,
  DistrictId,
  PartyId,
  LanguageCode,
} from '@votingworks/types';
import { convertToVxfBallotStyle, normalizeState, UsState } from './types';

const { ENGLISH, SPANISH } = LanguageCode;

test('convertToVxfBallotStyle()', () => {
  const districtIds: DistrictId[] = [
    'district1' as DistrictId,
    'district2' as DistrictId,
  ];

  expect(
    convertToVxfBallotStyle({
      districtIds,
      id: '1_A_en_es-US' as VxfBallotStyle['id'],
      group_id: '1_A' as VxfBallotStyle['groupId'],
      languages: [ENGLISH, SPANISH],
      precinctsOrSplits: [
        { precinctId: 'precinct1' },
        { precinctId: 'precinct2', splitId: 'precinct2-split1' },
      ],
      partyId: 'partyA' as PartyId,
    })
  ).toEqual<VxfBallotStyle>({
    districts: districtIds,
    id: '1_A_en_es-US' as VxfBallotStyle['id'],
    groupId: '1_A' as VxfBallotStyle['groupId'],
    precincts: ['precinct1', 'precinct2'],
    languages: [ENGLISH, SPANISH],
    partyId: 'partyA' as PartyId,
  });

  expect(
    convertToVxfBallotStyle({
      districtIds,
      id: '2_es-US' as VxfBallotStyle['id'],
      group_id: '2' as VxfBallotStyle['groupId'],
      languages: [SPANISH],
      precinctsOrSplits: [{ precinctId: 'precinct1' }],
    })
  ).toEqual<VxfBallotStyle>({
    districts: districtIds,
    id: '2_es-US' as VxfBallotStyle['id'],
    groupId: '2' as VxfBallotStyle['groupId'],
    precincts: ['precinct1'],
    languages: [SPANISH],
  });
});

describe('normalizeState', () => {
  test.each([
    {
      input: ['nh', 'NH', 'New Hampshire', 'NEW HAMPSHIRE'],
      expectedState: UsState.NEW_HAMPSHIRE,
    },
    {
      input: ['ms', 'MS', 'Mississippi', 'MISSISSIPPI'],
      expectedState: UsState.MISSISSIPPI,
    },
    {
      input: ['State of Hamilton'],
      expectedState: UsState.UNKNOWN,
    },
  ])('normalizes state string: $expectedState', ({ input, expectedState }) => {
    for (const state of input) {
      expect(normalizeState(state)).toEqual(expectedState);
    }
  });
});
