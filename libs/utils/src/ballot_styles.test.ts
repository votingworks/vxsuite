import { describe, expect, test } from 'vitest';
import {
  BallotStyle,
  BallotStyleGroupId,
  BallotStyleId,
  DistrictId,
  Election,
  hasSplits,
  Party,
  PartyId,
  Tabulation,
} from '@votingworks/types';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneral,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { assert, find } from '@votingworks/basics';
import {
  generateBallotStyleId,
  getBallotStyleGroup,
  getBallotStyleGroupsForPrecinctOrSplit,
  getGroupedBallotStyles,
  getPrecinctsAndSplitsForBallotStyle,
  getRelatedBallotStyle,
  determinePartyId,
  ballotStyleHasPrecinctOrSplit,
} from './ballot_styles';

const electionGeneral = readElectionGeneral();

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

const electionFamousNames = electionFamousNames2021Fixtures.readElection();

const GREEN_PARTY: Party = {
  abbrev: 'G',
  fullName: 'The Great Green Party',
  id: 'green-party' as PartyId,
  name: 'Green Party',
};

describe('generateBallotStyleId', () => {
  test('with party ID', () => {
    expect(
      generateBallotStyleId({
        ballotStyleIndex: 3,
        languages: ['en', 'es-US'],
        party: GREEN_PARTY,
      })
    ).toEqual(`3-G_en_es-US`);
  });

  test('without party ID', () => {
    expect(
      generateBallotStyleId({
        ballotStyleIndex: 3,
        languages: ['zh-Hans'],
      })
    ).toEqual('3_zh-Hans');
  });
});

describe('ballot style groups', () => {
  function makeBallotStyle(
    params: Pick<BallotStyle, 'id' | 'groupId' | 'languages' | 'partyId'>
  ): BallotStyle {
    return {
      ...params,
      districts: ['district1' as DistrictId],
      precincts: ['precinct1'],
    };
  }

  const style1English = makeBallotStyle({
    id: '1_en' as BallotStyleId,
    groupId: '1' as BallotStyleGroupId,
    languages: ['en'],
  });

  const style1Spanish = makeBallotStyle({
    id: '1_es-US' as BallotStyleId,
    groupId: '1' as BallotStyleGroupId,
    languages: ['es-US'],
  });

  const style2GreenEnglish = makeBallotStyle({
    id: '2-G_en' as BallotStyleId,
    languages: ['en'],
    groupId: '2-G' as BallotStyleGroupId,
    partyId: 'green-party' as PartyId,
  });

  const style2GreenEnglishMultiLanguage = makeBallotStyle({
    id: '2-G_en_es-US' as BallotStyleId,
    groupId: '2-G' as BallotStyleGroupId,
    languages: ['en', 'es-US'],
    partyId: 'green-party' as PartyId,
  });

  const style2GreenNonEnglishSingleLanguage = makeBallotStyle({
    id: '2-G_zh-Hans' as BallotStyleId,
    groupId: '2-G' as BallotStyleGroupId,
    languages: ['zh-Hans'],
    partyId: 'green-party' as PartyId,
  });

  const style2PurpleEnglish = makeBallotStyle({
    id: '2-P_en' as BallotStyleId,
    groupId: '2-P' as BallotStyleGroupId,
    languages: ['en'],
    partyId: 'purple-party' as PartyId,
  });

  const style3LegacySchema = makeBallotStyle({
    id: 'ballot-style-3' as BallotStyleId,
    groupId: 'ballot-style-3' as BallotStyleGroupId,
  });

  test('getGroupedBallotStyles', () => {
    expect(
      getGroupedBallotStyles([
        style1English,
        style1Spanish,
        style2GreenEnglish,
        style2GreenEnglishMultiLanguage,
        style2GreenNonEnglishSingleLanguage,
        style2PurpleEnglish,
        style3LegacySchema,
      ])
    ).toEqual([
      {
        ...style1English,
        id: '1' as BallotStyleGroupId,
        ballotStyles: [style1English, style1Spanish],
        defaultLanguageBallotStyle: style1English,
      },
      {
        ballotStyles: [
          style2GreenEnglish,
          style2GreenEnglishMultiLanguage,
          style2GreenNonEnglishSingleLanguage,
        ],
        ...style2GreenEnglish,
        id: '2-G' as BallotStyleGroupId,
        defaultLanguageBallotStyle: style2GreenEnglish,
      },
      {
        ballotStyles: [style2PurpleEnglish],
        ...style2PurpleEnglish,
        id: '2-P',
        defaultLanguageBallotStyle: style2PurpleEnglish,
      },
      {
        ballotStyles: [style3LegacySchema],
        ...style3LegacySchema,
        id: 'ballot-style-3',
        defaultLanguageBallotStyle: style3LegacySchema,
      },
    ]);
  });

  test('getBallotStyleGroup', () => {
    const election: Election = {
      ...electionGeneral,
      ballotStyles: [
        style1English,
        style1Spanish,
        style2GreenEnglish,
        style2GreenEnglishMultiLanguage,
        style2GreenNonEnglishSingleLanguage,
        style2PurpleEnglish,
        style3LegacySchema,
      ],
    };
    expect(
      getBallotStyleGroup({
        election,
        ballotStyleGroupId: '1' as BallotStyleGroupId,
      })
    ).toEqual({
      ...style1English,
      id: '1' as BallotStyleGroupId,
      ballotStyles: [style1English, style1Spanish],
      defaultLanguageBallotStyle: style1English,
    });
    expect(
      getBallotStyleGroup({
        election,
        ballotStyleGroupId: '2-G' as BallotStyleGroupId,
      })
    ).toEqual({
      ballotStyles: [
        style2GreenEnglish,
        style2GreenEnglishMultiLanguage,
        style2GreenNonEnglishSingleLanguage,
      ],
      ...style2GreenEnglish,
      id: '2-G' as BallotStyleGroupId,
      defaultLanguageBallotStyle: style2GreenEnglish,
    });
    expect(
      getBallotStyleGroup({
        election,
        ballotStyleGroupId: '2-P' as BallotStyleGroupId,
      })
    ).toEqual({
      ...style2PurpleEnglish,
      ballotStyles: [style2PurpleEnglish],
      id: '2-P',
      defaultLanguageBallotStyle: style2PurpleEnglish,
    });
    expect(
      getBallotStyleGroup({
        election,
        ballotStyleGroupId: 'ballot-style-3' as BallotStyleGroupId,
      })
    ).toEqual({
      ...style3LegacySchema,
      ballotStyles: [style3LegacySchema],
      id: 'ballot-style-3',
      defaultLanguageBallotStyle: style3LegacySchema,
    });

    expect(
      getBallotStyleGroup({
        election,
        ballotStyleGroupId: style1English.id as unknown as BallotStyleGroupId,
      })
    ).toBeUndefined();
  });

  test('getRelatedBallotStyle', () => {
    const ballotStyles = [
      style1English,
      style1Spanish,
      style2GreenEnglish,
      style2GreenEnglishMultiLanguage,
      style2GreenNonEnglishSingleLanguage,
      style2PurpleEnglish,
      style3LegacySchema,
    ];

    expect(
      getRelatedBallotStyle({
        ballotStyles,
        sourceBallotStyleId: style1Spanish.id,
        targetBallotStyleLanguage: 'en',
      }).unsafeUnwrap()
    ).toEqual(style1English);

    expect(
      getRelatedBallotStyle({
        ballotStyles,
        sourceBallotStyleId: style1English.id,
        targetBallotStyleLanguage: 'es-US',
      }).unsafeUnwrap()
    ).toEqual(style1Spanish);
  });

  test('getRelatedBallotStyle handles legacy styles', () => {
    expect(
      getRelatedBallotStyle({
        ballotStyles: [style1English, style1Spanish, style3LegacySchema],
        sourceBallotStyleId: style3LegacySchema.id,
        targetBallotStyleLanguage: 'es-US',
      }).unsafeUnwrap()
    ).toEqual(style3LegacySchema);
  });

  test('getRelatedBallotStyle source style not found', () => {
    expect(
      getRelatedBallotStyle({
        ballotStyles: [style1English],
        sourceBallotStyleId: style2PurpleEnglish.id,
        targetBallotStyleLanguage: 'en',
      }).err()
    ).toMatch('not found');
  });

  test('getRelatedBallotStyle target style not found', () => {
    expect(
      getRelatedBallotStyle({
        ballotStyles: [style1English],
        sourceBallotStyleId: style1English.id,
        targetBallotStyleLanguage: 'es-US',
      }).err()
    ).toMatch('not found');
  });
});

test('getBallotStyleGroupForPrecinctOrSplit - general election', () => {
  const [precinct1, precinct2] = electionGeneral.precincts;
  assert(precinct1 && !hasSplits(precinct1));
  assert(precinct2 && hasSplits(precinct2));
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election: electionGeneral,
      precinctOrSplit: { precinct: precinct1 },
    }).map((group) => group.id)
  ).toEqual(['12']);
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election: electionGeneral,
      precinctOrSplit: { precinct: precinct2, split: precinct2.splits[0]! },
    }).map((group) => group.id)
  ).toEqual(['5']);
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election: electionGeneral,
      precinctOrSplit: { precinct: precinct2, split: precinct2.splits[1]! },
    }).map((group) => group.id)
  ).toEqual(['12']);
});

test('getBallotStyleGroupForPrecinctOrSplit - general election with rotated ballot style variations', () => {
  const [precinct1, precinct2, precinct3, precinct4] =
    electionFamousNames.precincts.toSorted((a, b) => a.id.localeCompare(b.id)); // ballot styles are defined in order of the precinct IDs sorted
  assert(precinct1 && !hasSplits(precinct1));
  assert(precinct2 && !hasSplits(precinct2));
  assert(precinct3 && !hasSplits(precinct3));
  assert(precinct4 && !hasSplits(precinct4));
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election: electionFamousNames,
      precinctOrSplit: { precinct: precinct1 },
    }).map((group) => group.id)
  ).toEqual(['1-1']);
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election: electionFamousNames,
      precinctOrSplit: { precinct: precinct2 },
    }).map((group) => group.id)
  ).toEqual(['1-2']);

  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election: electionFamousNames,
      precinctOrSplit: { precinct: precinct3 },
    }).map((group) => group.id)
  ).toEqual(['1-3']);
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election: electionFamousNames,
      precinctOrSplit: { precinct: precinct4 },
    }).map((group) => group.id)
  ).toEqual(['1-4']);
});

test('getBallotStyleGroupForPrecinctOrSplit - primary election', () => {
  const election = electionPrimaryPrecinctSplitsFixtures.readElection();
  const [precinct1, , , precinct4] = election.precincts;
  assert(precinct1 && !hasSplits(precinct1));
  assert(precinct4 && hasSplits(precinct4));
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election,
      precinctOrSplit: { precinct: precinct1 },
    }).map((group) => group.id)
  ).toEqual(['1-Ma', '1-F']);
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election,
      precinctOrSplit: { precinct: precinct4, split: precinct4.splits[0]! },
    }).map((group) => group.id)
  ).toEqual(['3-Ma', '3-F']);
  expect(
    getBallotStyleGroupsForPrecinctOrSplit({
      election,
      precinctOrSplit: { precinct: precinct4, split: precinct4.splits[1]! },
    }).map((group) => group.id)
  ).toEqual(['4-Ma', '4-F']);
});

test('getPrecinctsAndSplitsForBallotStyle', () => {
  const [precinct1, precinct2] = electionGeneral.precincts;
  assert(precinct1 && !hasSplits(precinct1));
  assert(precinct2 && hasSplits(precinct2));
  expect(
    getPrecinctsAndSplitsForBallotStyle({
      election: electionGeneral,
      ballotStyle: electionGeneral.ballotStyles[0]!,
    })
  ).toEqual([
    { precinct: precinct1 },
    { precinct: precinct2, split: precinct2.splits[1]! },
  ]);
  expect(
    getPrecinctsAndSplitsForBallotStyle({
      election: electionGeneral,
      ballotStyle: electionGeneral.ballotStyles[1]!,
    })
  ).toEqual([{ precinct: precinct2, split: precinct2.splits[0]! }]);
});

test('determinePartyId', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const partyCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    partyId: '0',
    bmd: [1],
    hmpb: [1],
  };

  const ballotStyleCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
    bmd: [1],
    hmpb: [1],
  };

  const precinctCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    precinctId: 'precinct-1',
    bmd: [1],
    hmpb: [1],
  };

  expect(determinePartyId(electionDefinition, partyCardCounts)).toEqual('0');
  expect(determinePartyId(electionDefinition, ballotStyleCardCounts)).toEqual(
    '0'
  );
  expect(determinePartyId(electionDefinition, precinctCardCounts)).toEqual(
    undefined
  );
});

test('determinePartyId - multi language election', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();

  const partyCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    partyId: '0',
    bmd: [1],
    hmpb: [1],
  };

  const ballotStyleCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    ballotStyleGroupId: '1-Ma' as BallotStyleGroupId,
    bmd: [1],
    hmpb: [1],
  };

  const ballotStyleCardCounts2: Tabulation.GroupOf<Tabulation.CardCounts> = {
    ballotStyleGroupId: 'fake-ballot-style' as BallotStyleGroupId,
    bmd: [1],
    hmpb: [1],
  };

  const precinctCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    precinctId: 'precinct-1',
    bmd: [1],
    hmpb: [1],
  };

  expect(determinePartyId(electionDefinition, partyCardCounts)).toEqual('0');
  expect(determinePartyId(electionDefinition, ballotStyleCardCounts)).toEqual(
    '0'
  );
  expect(determinePartyId(electionDefinition, precinctCardCounts)).toEqual(
    undefined
  );
  expect(determinePartyId(electionDefinition, ballotStyleCardCounts2)).toEqual(
    undefined
  );
});

test('ballotStyleHasPrecinctOrSplit', () => {
  const election = electionPrimaryPrecinctSplitsFixtures.readElection();
  const [precinct1, , , precinct4] = election.precincts;
  assert(precinct4 && hasSplits(precinct4));
  assert(precinct1 && !hasSplits(precinct1));
  const [split1, split2] = precinct4.splits;
  assert(split1 && split2);
  const split1BallotStyle = find(
    election.ballotStyles,
    (bs) => bs.id === '3-Ma_en'
  );
  const split2BallotStyle = find(
    election.ballotStyles,
    (bs) => bs.id === '4-Ma_en'
  );
  const precinct1BallotStyle = find(
    election.ballotStyles,
    (bs) => bs.id === '1-Ma_en'
  );

  expect(
    ballotStyleHasPrecinctOrSplit(split1BallotStyle, { precinct: precinct1 })
  ).toEqual(false);
  expect(
    ballotStyleHasPrecinctOrSplit(split2BallotStyle, { precinct: precinct1 })
  ).toEqual(false);
  expect(
    ballotStyleHasPrecinctOrSplit(precinct1BallotStyle, { precinct: precinct1 })
  ).toEqual(true);

  expect(
    ballotStyleHasPrecinctOrSplit(split1BallotStyle, {
      precinct: precinct4,
      split: split1,
    })
  ).toEqual(true);
  expect(
    ballotStyleHasPrecinctOrSplit(split1BallotStyle, {
      precinct: precinct4,
      split: split2,
    })
  ).toEqual(false);

  expect(
    ballotStyleHasPrecinctOrSplit(split2BallotStyle, {
      precinct: precinct4,
      split: split2,
    })
  ).toEqual(true);
  expect(
    ballotStyleHasPrecinctOrSplit(split2BallotStyle, {
      precinct: precinct4,
      split: split1,
    })
  ).toEqual(false);

  expect(
    ballotStyleHasPrecinctOrSplit(precinct1BallotStyle, {
      precinct: precinct4,
      split: split1,
    })
  ).toEqual(false);
  expect(
    ballotStyleHasPrecinctOrSplit(precinct1BallotStyle, {
      precinct: precinct4,
      split: split2,
    })
  ).toEqual(false);
});
