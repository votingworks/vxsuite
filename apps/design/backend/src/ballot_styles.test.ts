import { typedAs } from '@votingworks/basics';
import {
  AnyContest,
  District,
  DistrictId,
  Party,
  PartyId,
} from '@votingworks/types';
import {
  generateBallotStyleGroupId,
  generateBallotStyleId,
} from '@votingworks/utils';

import { generateBallotStyles } from './ballot_styles';
import { BallotStyle, Precinct, PrecinctSplit } from './types';
import { LanguageCode } from './language_code';

function makeContest(
  id: string,
  districtId: DistrictId,
  partyId?: PartyId
): AnyContest {
  return {
    id,
    districtId,
    type: 'candidate',
    title: id,
    candidates: [],
    allowWriteIns: true,
    seats: 1,
    partyId,
  };
}

describe('generateBallotStyles()', () => {
  const { ENGLISH, SPANISH } = LanguageCode;

  const district1: District = {
    id: 'district-1' as DistrictId,
    name: 'District 1',
  };
  const district2: District = {
    id: 'district-2' as DistrictId,
    name: 'District 2',
  };

  const partyA: Party = {
    id: 'party-A' as PartyId,
    name: 'Party A',
    fullName: 'Party A',
    abbrev: 'A',
  };
  const partyB: Party = {
    id: 'party-B' as PartyId,
    name: 'Party B',
    fullName: 'Party B',
    abbrev: 'B',
  };
  const partyC: Party = {
    id: 'party-C' as PartyId,
    name: 'Party C',
    fullName: 'Party C',
    abbrev: 'C',
  };

  const precinct1District1: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: [district1.id],
  };
  const precinct2District2: Precinct = {
    id: 'precinct-2',
    name: 'Precinct 2',
    districtIds: [district2.id],
  };

  const precinct3Splits = {
    district1And2: typedAs<PrecinctSplit>({
      id: 'precinct-3-split-1',
      name: 'Precinct 2 - Split 1',
      districtIds: [district1.id, district2.id],
    }),
    district1Only: typedAs<PrecinctSplit>({
      id: 'precinct-2-split-2',
      name: 'Precinct 2 - Split 2',
      // Should share a ballot style with precinct-1, since same districts assigned
      districtIds: [district1.id],
    }),
    noDistricts: typedAs<PrecinctSplit>({
      id: 'precinct-2-split-4',
      name: 'Precinct 2 - Split 3',
      // Shouldn't get a ballot style, since no districts assigned
      districtIds: [],
    }),
  } as const;
  const precinct3District1And2: Precinct = {
    id: 'precinct-3-with-splits',
    name: 'Precinct 3 - With Splits',
    splits: Object.values(precinct3Splits),
  };

  const precinct4NoDistricts: Precinct = {
    id: 'precinct-4',
    name: 'Precinct 4',
    // Shouldn't get a ballot style, since no districts assigned
    districtIds: [],
  };

  const generalContest1 = makeContest('contest-1', district1.id);
  const generalContest2 = makeContest('contest-2', district2.id);

  /* eslint-disable vx/gts-identifiers */
  const partyAContest1 = makeContest('contest-1A', district1.id, partyA.id);
  const partyAContest2 = makeContest('contest-2A', district2.id, partyA.id);
  const partyBContest1 = makeContest('contest-1B', district1.id, partyB.id);
  const partyBContest2 = makeContest('contest-2B', district2.id, partyB.id);
  /* eslint-enable vx/gts-identifiers */

  test('general election, no splits', () => {
    const ballotLanguageConfigs = [
      { languages: [ENGLISH] },
      { languages: [ENGLISH, SPANISH] },
    ];
    const ballotStyles = generateBallotStyles({
      ballotLanguageConfigs,
      contests: [generalContest1, generalContest2],
      electionType: 'general',
      parties: [],
      precincts: [precinct1District1, precinct2District2, precinct4NoDistricts],
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 1, languages }),
        group_id: generateBallotStyleGroupId({ ballotStyleIndex: 1 }),
        districtIds: [district1.id],
        languages,
        precinctsOrSplits: [{ precinctId: precinct1District1.id }],
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 2, languages }),
        group_id: generateBallotStyleGroupId({ ballotStyleIndex: 2 }),
        districtIds: [district2.id],
        languages,
        precinctsOrSplits: [{ precinctId: precinct2District2.id }],
      })),
    ]);
  });

  test('general election, split precincts', () => {
    const ballotLanguageConfigs = [
      { languages: [ENGLISH] },
      { languages: [ENGLISH, SPANISH] },
    ];
    const ballotStyles = generateBallotStyles({
      ballotLanguageConfigs,
      contests: [generalContest1, generalContest2],
      electionType: 'general',
      parties: [],
      precincts: [
        precinct1District1,
        precinct3District1And2,
        precinct4NoDistricts,
      ],
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 1, languages }),
        group_id: generateBallotStyleGroupId({ ballotStyleIndex: 1 }),
        districtIds: [district1.id],
        languages,
        precinctsOrSplits: [
          { precinctId: precinct1District1.id },
          {
            precinctId: precinct3District1And2.id,
            splitId: precinct3Splits.district1Only.id,
          },
        ],
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 2, languages }),
        group_id: generateBallotStyleGroupId({ ballotStyleIndex: 2 }),
        districtIds: [district1.id, district2.id],
        languages,
        precinctsOrSplits: [
          {
            precinctId: precinct3District1And2.id,
            splitId: precinct3Splits.district1And2.id,
          },
        ],
      })),
    ]);
  });

  test('primary election, no splits', () => {
    const ballotLanguageConfigs = [
      { languages: [ENGLISH] },
      { languages: [ENGLISH, SPANISH] },
    ];
    const ballotStyles = generateBallotStyles({
      ballotLanguageConfigs,
      contests: [
        partyAContest1,
        partyAContest2,
        partyBContest1,
        partyBContest2,
      ],
      electionType: 'primary',
      parties: [partyA, partyB, partyC],
      precincts: [precinct1District1, precinct2District2, precinct4NoDistricts],
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          languages,
          party: partyA,
        }),
        group_id: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          party: partyA,
        }),
        districtIds: [district1.id],
        languages,
        partyId: partyA.id,
        precinctsOrSplits: [{ precinctId: precinct1District1.id }],
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          languages,
          party: partyB,
        }),
        group_id: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          party: partyB,
        }),
        districtIds: [district1.id],
        languages,
        partyId: partyB.id,
        precinctsOrSplits: [{ precinctId: precinct1District1.id }],
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyA,
        }),
        group_id: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyA,
        }),
        districtIds: [district2.id],
        languages,
        partyId: partyA.id,
        precinctsOrSplits: [{ precinctId: precinct2District2.id }],
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyB,
        }),
        group_id: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyB,
        }),
        districtIds: [district2.id],
        languages,
        partyId: partyB.id,
        precinctsOrSplits: [{ precinctId: precinct2District2.id }],
      })),
    ]);
  });

  test('primary election, split precincts', () => {
    const ballotLanguageConfigs = [
      { languages: [ENGLISH] },
      { languages: [ENGLISH, SPANISH] },
    ];
    const ballotStyles = generateBallotStyles({
      ballotLanguageConfigs,
      contests: [
        partyAContest1,
        partyAContest2,
        partyBContest1,
        partyBContest2,
      ],
      electionType: 'primary',
      parties: [partyA, partyB, partyC],
      precincts: [
        precinct1District1,
        precinct3District1And2,
        precinct4NoDistricts,
      ],
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          languages,
          party: partyA,
        }),
        group_id: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          party: partyA,
        }),
        districtIds: [district1.id],
        languages,
        partyId: partyA.id,
        precinctsOrSplits: [
          { precinctId: precinct1District1.id },
          {
            precinctId: precinct3District1And2.id,
            splitId: precinct3Splits.district1Only.id,
          },
        ],
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          languages,
          party: partyB,
        }),
        group_id: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          party: partyB,
        }),
        districtIds: [district1.id],
        languages,
        partyId: partyB.id,
        precinctsOrSplits: [
          { precinctId: precinct1District1.id },
          {
            precinctId: precinct3District1And2.id,
            splitId: precinct3Splits.district1Only.id,
          },
        ],
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyA,
        }),
        group_id: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyA,
        }),
        districtIds: [district1.id, district2.id],
        languages,
        partyId: partyA.id,
        precinctsOrSplits: [
          {
            precinctId: precinct3District1And2.id,
            splitId: precinct3Splits.district1And2.id,
          },
        ],
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyB,
        }),
        group_id: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyB,
        }),
        districtIds: [district1.id, district2.id],
        languages,
        partyId: partyB.id,
        precinctsOrSplits: [
          {
            precinctId: precinct3District1And2.id,
            splitId: precinct3Splits.district1And2.id,
          },
        ],
      })),
    ]);
  });
});
