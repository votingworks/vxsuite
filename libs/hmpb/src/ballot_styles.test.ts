import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { typedAs } from '@votingworks/basics';
import {
  AnyContest,
  District,
  DistrictId,
  Party,
  PartyId,
  LanguageCode,
  Precinct,
  PrecinctSplit,
  BallotStyle,
} from '@votingworks/types';
import {
  ballotStyleHasPrecinctSplit,
  generateBallotStyleGroupId,
  generateBallotStyleId,
} from '@votingworks/utils';
import { generateBallotStyles } from './ballot_styles';
import * as ballotRotation from './ballot_rotation';

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
    candidates: [
      { id: 'candidate-1', name: 'A' },
      { id: 'candidate-2', name: 'B' },
      { id: 'candidate-3', name: 'C' },
    ],
    allowWriteIns: true,
    seats: 1,
    partyId,
  };
}

describe('generateBallotStyles()', () => {
  // Spy on getAllPossibleCandidateOrderings so we can mock it in specific tests
  let mockGetAllPossibleCandidateOrderings = vi.spyOn(
    ballotRotation,
    'getAllPossibleCandidateOrderings'
  );

  beforeEach(() => {
    // Create a fresh spy before each test that calls through to the original implementation
    mockGetAllPossibleCandidateOrderings = vi.spyOn(
      ballotRotation,
      'getAllPossibleCandidateOrderings'
    );
  });

  afterEach(() => {
    // Restore the original implementation after each test
    mockGetAllPossibleCandidateOrderings.mockRestore();
  });

  const { ENGLISH, SPANISH } = LanguageCode;

  const district1: District = {
    id: 'district-1' as DistrictId,
    name: 'District 1',
  };
  const district2: District = {
    id: 'district-2' as DistrictId,
    name: 'District 2',
  };
  const district3NoContests: District = {
    id: 'district-3' as DistrictId,
    name: 'District 3',
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
    name: 'A - Precinct 1',
    districtIds: [district1.id],
  };
  const precinct2District2: Precinct = {
    id: 'precinct-2',
    name: 'B - Precinct 2',
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
    noContests: typedAs<PrecinctSplit>({
      id: 'precinct-2-split-5',
      name: 'Precinct 2 - Split 5',
      // Shouldn't get a ballot style, since no contests assigned
      districtIds: [district3NoContests.id],
    }),
  } as const;
  const precinct3District1And2: Precinct = {
    id: 'precinct-3-with-splits',
    name: 'C - Precinct 3 - With Splits',
    splits: Object.values(precinct3Splits),
  };

  const precinct4NoDistricts: Precinct = {
    id: 'precinct-4',
    name: 'D - Precinct 4',
    // Shouldn't get a ballot style, since no districts assigned
    districtIds: [],
  };

  const precinct5NoContests: Precinct = {
    id: 'precinct-5',
    name: 'E - Precinct 5',
    // Shouldn't get a ballot style, since no contests assigned
    districtIds: [district3NoContests.id],
  };

  const generalContest1 = makeContest('contest-1', district1.id);
  const generalContest2 = makeContest('contest-2', district2.id);

  /* eslint-disable vx/gts-identifiers */
  const partyAContest1 = makeContest('contest-1A', district1.id, partyA.id);
  const partyAContest2 = makeContest('contest-2A', district2.id, partyA.id);
  const partyBContest1 = makeContest('contest-1B', district1.id, partyB.id);
  const partyBContest2 = makeContest('contest-2B', district2.id, partyB.id);
  /* eslint-enable vx/gts-identifiers */

  test('general election, no splits, default rotation', () => {
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
        precinct2District2,
        precinct4NoDistricts,
        precinct5NoContests,
      ],
      ballotTemplateId: 'VxDefaultBallot',
      electionId: 'test-election',
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 1, languages }),
        groupId: generateBallotStyleGroupId({ ballotStyleIndex: 1 }),
        districts: [district1.id],
        languages,
        precincts: [precinct1District1.id],
        orderedCandidatesByContest: {
          [generalContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 2, languages }),
        groupId: generateBallotStyleGroupId({ ballotStyleIndex: 2 }),
        districts: [district2.id],
        languages,
        precincts: [precinct2District2.id],
        orderedCandidatesByContest: {
          [generalContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
    ]);
  });

  test('general election, split precincts, default rotation', () => {
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
        precinct5NoContests,
      ],
      ballotTemplateId: 'VxDefaultBallot',
      electionId: 'test-election',
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 1, languages }),
        groupId: generateBallotStyleGroupId({ ballotStyleIndex: 1 }),
        districts: [district1.id],
        languages,
        precincts: [precinct1District1.id, precinct3District1And2.id],
        orderedCandidatesByContest: {
          [generalContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 2, languages }),
        groupId: generateBallotStyleGroupId({ ballotStyleIndex: 2 }),
        districts: [district1.id, district2.id],
        languages,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [generalContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [generalContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
    ]);
  });

  test('general election, split precincts, rotation by precinct', () => {
    const ballotLanguageConfigs = [
      { languages: [ENGLISH] },
      { languages: [ENGLISH, SPANISH] },
    ];
    mockGetAllPossibleCandidateOrderings.mockImplementation((_, params) =>
      ballotRotation.getCandidateOrderingByPrecinctAlphabetical(params)
    );

    const ballotStyles = generateBallotStyles({
      ballotLanguageConfigs,
      contests: [generalContest1, generalContest2],
      electionType: 'general',
      parties: [],
      precincts: [
        precinct1District1,
        precinct3District1And2,
        precinct4NoDistricts,
        precinct5NoContests,
      ],
      ballotTemplateId: 'VxDefaultBallot',
      electionId: 'test-election',
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          rotationIndex: 1,
          languages,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          rotationIndex: 1,
        }),
        districts: [district1.id],
        languages,
        precincts: [precinct1District1.id],
        orderedCandidatesByContest: {
          [generalContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          rotationIndex: 2,
          languages,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          rotationIndex: 2,
        }),
        districts: [district1.id],
        languages,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [generalContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({ ballotStyleIndex: 2, languages }),
        groupId: generateBallotStyleGroupId({ ballotStyleIndex: 2 }),
        districts: [district1.id, district2.id],
        languages,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [generalContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [generalContest2.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
        },
      })),
    ]);
  });

  test('primary election, no splits, default rotation', () => {
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
        precinct2District2,
        precinct4NoDistricts,
        precinct5NoContests,
      ],
      ballotTemplateId: 'VxDefaultBallot',
      electionId: 'test-election',
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          languages,
          party: partyA,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          party: partyA,
        }),
        districts: [district1.id],
        languages,
        partyId: partyA.id,
        precincts: [precinct1District1.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          languages,
          party: partyB,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          party: partyB,
        }),
        districts: [district1.id],
        languages,
        partyId: partyB.id,
        precincts: [precinct1District1.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyA,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyA,
        }),
        districts: [district2.id],
        languages,
        partyId: partyA.id,
        precincts: [precinct2District2.id],
        orderedCandidatesByContest: {
          [partyAContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyB,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyB,
        }),
        districts: [district2.id],
        languages,
        partyId: partyB.id,
        precincts: [precinct2District2.id],
        orderedCandidatesByContest: {
          [partyAContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
    ]);
  });

  test('primary election, split precincts, no rotation', () => {
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
        precinct5NoContests,
      ],
      ballotTemplateId: 'VxDefaultBallot',
      electionId: 'test-election',
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          languages,
          party: partyA,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          party: partyA,
        }),
        districts: [district1.id],
        languages,
        partyId: partyA.id,
        precincts: [precinct1District1.id, precinct3District1And2.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          languages,
          party: partyB,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          party: partyB,
        }),
        districts: [district1.id],
        languages,
        partyId: partyB.id,
        precincts: [precinct1District1.id, precinct3District1And2.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyA,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyA,
        }),
        districts: [district1.id, district2.id],
        languages,
        partyId: partyA.id,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyAContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyB,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyB,
        }),
        districts: [district1.id, district2.id],
        languages,
        partyId: partyB.id,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyAContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest2.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
    ]);
  });

  test('primary election, split precincts, rotation by precinct', () => {
    const ballotLanguageConfigs = [
      { languages: [ENGLISH] },
      { languages: [ENGLISH, SPANISH] },
    ];
    mockGetAllPossibleCandidateOrderings.mockImplementation((_, params) =>
      ballotRotation.getCandidateOrderingByPrecinctAlphabetical(params)
    );
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
        precinct5NoContests,
      ],
      ballotTemplateId: 'VxDefaultBallot',
      electionId: 'test-election',
    });

    expect(ballotStyles).toEqual<BallotStyle[]>([
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          rotationIndex: 1,
          languages,
          party: partyA,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          rotationIndex: 1,
          party: partyA,
        }),
        districts: [district1.id],
        languages,
        partyId: partyA.id,
        precincts: [precinct1District1.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          rotationIndex: 1,
          languages,
          party: partyB,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          rotationIndex: 1,
          party: partyB,
        }),
        districts: [district1.id],
        languages,
        partyId: partyB.id,
        precincts: [precinct1District1.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-1' },
            { id: 'candidate-2' },
            { id: 'candidate-3' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          rotationIndex: 2,
          languages,
          party: partyA,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          rotationIndex: 2,
          party: partyA,
        }),
        districts: [district1.id],
        languages,
        partyId: partyA.id,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 1,
          rotationIndex: 2,
          languages,
          party: partyB,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 1,
          rotationIndex: 2,
          party: partyB,
        }),
        districts: [district1.id],
        languages,
        partyId: partyB.id,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyA,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyA,
        }),
        districts: [district1.id, district2.id],
        languages,
        partyId: partyA.id,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [partyAContest2.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [partyBContest2.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
        },
      })),
      ...ballotLanguageConfigs.map<BallotStyle>(({ languages }) => ({
        id: generateBallotStyleId({
          ballotStyleIndex: 2,
          languages,
          party: partyB,
        }),
        groupId: generateBallotStyleGroupId({
          ballotStyleIndex: 2,
          party: partyB,
        }),
        districts: [district1.id, district2.id],
        languages,
        partyId: partyB.id,
        precincts: [precinct3District1And2.id],
        orderedCandidatesByContest: {
          [partyAContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [partyAContest2.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [partyBContest1.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
          [partyBContest2.id]: [
            { id: 'candidate-3' },
            { id: 'candidate-1' },
            { id: 'candidate-2' },
          ],
        },
      })),
    ]);
  });

  test('precincts with the same district IDs in different orders', () => {
    const precinct1: Precinct = {
      id: 'precinct-1',
      name: 'Precinct 1',
      districtIds: [district1.id, district2.id],
    };
    const precinct2: Precinct = {
      id: 'precinct-2',
      name: 'Precinct 2',
      districtIds: [district2.id, district1.id],
    };
    const precinct3: Precinct = {
      id: 'precinct-3',
      name: 'Precinct 3',
      splits: [
        {
          id: 'precinct-3-split-1',
          name: 'Precinct 3 - Split 1',
          districtIds: [district1.id, district2.id],
        },
        {
          id: 'precinct-3-split-3',
          name: 'Precinct 3 - Split 3',
          districtIds: [district1.id],
        },
      ],
    };
    const precinct4: Precinct = {
      id: 'precinct-4',
      name: 'Precinct 4',
      districtIds: [district1.id],
    };

    const ballotLanguageConfigs = [{ languages: [ENGLISH] }];
    const ballotStyles = generateBallotStyles({
      ballotLanguageConfigs,
      contests: [generalContest1, generalContest2],
      electionType: 'general',
      parties: [],
      precincts: [precinct1, precinct2, precinct3, precinct4],
      ballotTemplateId: 'VxDefaultBallot',
      electionId: 'test-election',
    });
    expect(ballotStyles.length).toEqual(2);
    expect(ballotStyles[0].districts).toEqual([district1.id, district2.id]);
    expect(ballotStyles[0].precincts).toEqual([
      precinct1.id,
      precinct2.id,
      precinct3.id,
    ]);
    expect(
      ballotStyleHasPrecinctSplit(
        ballotStyles[0],
        precinct3.id,
        precinct3.splits[0]
      )
    ).toEqual(true);
    expect(ballotStyles[1].districts).toEqual([district1.id]);
    expect(ballotStyles[1].precincts).toEqual([precinct3.id, precinct4.id]);
    expect(
      ballotStyleHasPrecinctSplit(
        ballotStyles[1],
        precinct3.id,
        precinct3.splits[1]
      )
    ).toEqual(true);
  });
});
