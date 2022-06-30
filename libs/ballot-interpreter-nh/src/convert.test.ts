import {
  AdjudicationReason,
  BallotPaperSize,
  CandidateContest,
  DistrictIdSchema,
  GridPosition,
  PartyIdSchema,
  safeParseElection,
  unsafeParse,
  YesNoContest,
} from '@votingworks/types';
import { typedAs } from '@votingworks/utils';
import {
  AmherstFixtureName,
  HudsonFixtureName,
  readFixtureBallotCardDefinition,
  readFixtureDefinition,
  readFixtureJson,
} from '../test/fixtures';
import { asciiOvalGrid, testImageDebugger } from '../test/utils';
import {
  TemplateBallotCardGeometry8pt5x11,
  TemplateBallotCardGeometry8pt5x14,
} from './accuvote';
import {
  convertElectionDefinition,
  convertElectionDefinitionHeader,
  ConvertIssue,
  ConvertIssueKind,
  ConvertResult,
  readGridFromElectionDefinition,
} from './convert';
import * as templates from './data/templates';

if (process.env.CI) {
  jest.setTimeout(10_000);
}

test('converting the Hudson ballot', async () => {
  const hudsonBallotCardDefinition = await readFixtureBallotCardDefinition(
    HudsonFixtureName,
    TemplateBallotCardGeometry8pt5x14
  );
  const debug = testImageDebugger(hudsonBallotCardDefinition.front);
  const convertResult = convertElectionDefinition(hudsonBallotCardDefinition, {
    ovalTemplate: await templates.getOvalTemplate(),
    debug,
  });

  // uncomment this to update the fixture
  // await (
  //   await import('fs/promises')
  // ).writeFile(
  //   (
  //     await import('../test/fixtures')
  //   ).getFixturePath(HudsonFixtureName, 'election.json'),
  //   JSON.stringify(electionDefinition, null, 2),
  //   'utf8'
  // );

  const election = safeParseElection(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();
  expect(convertResult).toEqual({
    success: true,
    election,
    issues: [],
  });
});

test('letter-size card definition', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  hudsonBallotCardDefinition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

  const convertHeaderResult = convertElectionDefinitionHeader(
    hudsonBallotCardDefinition
  );

  expect(convertHeaderResult.election?.ballotLayout?.paperSize).toEqual(
    BallotPaperSize.Letter
  );
});

test('mismatched ballot image size', async () => {
  const hudsonBallotCardDefinition = await readFixtureBallotCardDefinition(
    HudsonFixtureName,
    TemplateBallotCardGeometry8pt5x14
  );

  hudsonBallotCardDefinition.definition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

  expect(
    convertElectionDefinition(hudsonBallotCardDefinition, {
      ovalTemplate: await templates.getOvalTemplate(),
    }).issues
  ).toEqual(
    expect.arrayContaining([
      typedAs<ConvertIssue>({
        kind: ConvertIssueKind.InvalidTemplateSize,
        message: expect.stringContaining(
          'Template images do not match expected sizes.'
        ),
        paperSize: BallotPaperSize.Letter,
        frontTemplateSize: { width: 684, height: 1080 },
        backTemplateSize: { width: 684, height: 1080 },
      }),
    ])
  );
});

test('missing ElectionID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionID')[0]!;
  electionIdElement.parentNode?.removeChild(electionIdElement);

  expect(
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'ElectionID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionID',
    }),
  ]);
});

test('missing ElectionName', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionNameElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionName')[0]!;
  electionNameElement.parentNode?.removeChild(electionNameElement);

  expect(
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'ElectionName is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionName',
    }),
  ]);
});

test('missing TownName', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const townNameElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownName')[0]!;
  townNameElement.parentNode?.removeChild(townNameElement);

  expect(
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'TownName is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > TownName',
    }),
  ]);
});

test('missing TownID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const townIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('TownID')[0]!;
  townIdElement.parentNode?.removeChild(townIdElement);

  expect(
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'TownID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > TownID',
    }),
  ]);
});

test('missing ElectionDate', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const electionDateElement =
    hudsonBallotCardDefinition.getElementsByTagName('ElectionDate')[0]!;
  electionDateElement.parentNode?.removeChild(electionDateElement);

  expect(
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'ElectionDate is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > ElectionDate',
    }),
  ]);
});

test('missing PrecinctID', async () => {
  const hudsonBallotCardDefinition = await readFixtureDefinition(
    HudsonFixtureName
  );

  const precinctIdElement =
    hudsonBallotCardDefinition.getElementsByTagName('PrecinctID')[0]!;
  precinctIdElement.parentNode?.removeChild(precinctIdElement);

  expect(
    convertElectionDefinitionHeader(hudsonBallotCardDefinition).issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'PrecinctID is missing',
      property: 'AVSInterface > AccuvoteHeaderInfo > PrecinctID',
    }),
  ]);
});

test('multi-party endorsement', async () => {
  const amherstBallotCardDefinition = await readFixtureDefinition(
    AmherstFixtureName
  );

  expect(
    convertElectionDefinitionHeader(amherstBallotCardDefinition).election
      ?.contests
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining(
        typedAs<Partial<CandidateContest>>({
          id: 'Sheriff-4243fe0b',
          title: 'Sheriff',
          candidates: [
            {
              id: 'Edward-Randolph-bf4c848a',
              name: 'Edward Randolph',
              partyIds: [
                unsafeParse(PartyIdSchema, 'Democratic-aea20adb'),
                unsafeParse(PartyIdSchema, 'Republican-f0167ce7'),
              ],
            },
          ],
        })
      ),
    ])
  );
});

test('missing Party on multi-party endorsement', async () => {
  const amherstBallotCardDefinition = await readFixtureDefinition(
    AmherstFixtureName
  );

  const sheriffElement = Array.from(
    amherstBallotCardDefinition.getElementsByTagName('Candidates')
  ).find((candidates) => {
    const officeName = candidates
      .getElementsByTagName('OfficeName')[0]!
      .getElementsByTagName('Name')[0]!.textContent;
    return officeName === 'Sheriff';
  })!;
  const sheriffCandidateElements =
    sheriffElement.getElementsByTagName('CandidateName');
  // const sheriffCandidateFirstElement = sheriffCandidateElements[0]!;
  const sheriffCandidateSecondElement = sheriffCandidateElements[1]!;

  const sheriffCandidateSecondPartyElement =
    sheriffCandidateSecondElement.getElementsByTagName('Party')[0]!;
  sheriffCandidateSecondPartyElement.parentNode!.removeChild(
    sheriffCandidateSecondPartyElement
  );

  expect(
    convertElectionDefinitionHeader(amherstBallotCardDefinition).issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message:
        'Party is missing in candidate "Edward Randolph" of office "Sheriff", required for multi-party endorsement',
      property: 'AVSInterface > Candidates > CandidateName > Party',
    }),
  ]);
});

test('readGridFromElectionDefinition', async () => {
  const definition = await readFixtureDefinition(
    HudsonFixtureName,
    'definition'
  );
  const grid = readGridFromElectionDefinition(definition);
  expect(asciiOvalGrid(grid)).toMatchInlineSnapshot(`
    "                                  
                                      
                                      
                                      
                                      
                                      
                                      
                                      
                                      
                O      O      O       
                                      
                                     O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O       
                                      
                                     O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
    "
  `);
});

test('default adjudication reasons', async () => {
  const hudsonBallotCardDefinition = await readFixtureBallotCardDefinition(
    HudsonFixtureName,
    TemplateBallotCardGeometry8pt5x14
  );
  const debug = testImageDebugger(hudsonBallotCardDefinition.front);
  const convertResult = convertElectionDefinition(hudsonBallotCardDefinition, {
    ovalTemplate: await templates.getOvalTemplate(),
    debug,
  });
  expect(convertResult.election?.centralScanAdjudicationReasons).toEqual(
    typedAs<AdjudicationReason[]>([
      AdjudicationReason.UninterpretableBallot,
      AdjudicationReason.Overvote,
      AdjudicationReason.MarkedWriteIn,
      AdjudicationReason.BlankBallot,
    ])
  );
  expect(convertResult.election?.precinctScanAdjudicationReasons).toEqual(
    typedAs<AdjudicationReason[]>([
      AdjudicationReason.UninterpretableBallot,
      AdjudicationReason.Overvote,
      AdjudicationReason.BlankBallot,
    ])
  );
});

test('constitutional questions become yesno contests', async () => {
  const amherstBallotCardDefinition = await readFixtureBallotCardDefinition(
    AmherstFixtureName,
    TemplateBallotCardGeometry8pt5x11
  );
  const convertResult = convertElectionDefinitionHeader(
    amherstBallotCardDefinition.definition
  );

  expect(
    convertResult.election?.contests.filter((c) => c.type === 'yesno')
  ).toEqual(
    typedAs<YesNoContest[]>([
      {
        type: 'yesno',
        id: 'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
        section: 'Constitutional Amendment Question',
        title: 'Constitutional Amendment Question',
        description:
          'Shall there be a convention to amend or revise the constitution?',
        districtId: unsafeParse(DistrictIdSchema, 'town-id-00701-precinct-id-'),
      },
    ])
  );
});

test('constitutional question ovals get placed on the grid correctly', async () => {
  const amherstBallotCardDefinition = await readFixtureBallotCardDefinition(
    AmherstFixtureName,
    TemplateBallotCardGeometry8pt5x11
  );
  const convertResult = convertElectionDefinition(amherstBallotCardDefinition, {
    ovalTemplate: await templates.getOvalTemplate(),
  });

  expect(convertResult).toEqual(
    typedAs<ConvertResult>({
      success: true,
      issues: expect.any(Array),
      election: expect.objectContaining({
        contests: expect.arrayContaining([
          {
            type: 'yesno',
            id: 'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
            section: 'Constitutional Amendment Question',
            title: 'Constitutional Amendment Question',
            description:
              'Shall there be a convention to amend or revise the constitution?',
            districtId: unsafeParse(
              DistrictIdSchema,
              'town-id-00701-precinct-id-'
            ),
          },
        ]),
        gridLayouts: [
          expect.objectContaining({
            gridPositions: expect.arrayContaining(
              typedAs<GridPosition[]>([
                {
                  type: 'option',
                  contestId:
                    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
                  optionId: 'yes',
                  side: 'back',
                  column: 26,
                  row: 24,
                },
                {
                  type: 'option',
                  contestId:
                    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
                  optionId: 'no',
                  side: 'back',
                  column: 32,
                  row: 24,
                },
              ])
            ),
          }),
        ],
      }),
    })
  );

  for (const issue of convertResult.issues) {
    expect(issue).not.toMatchObject({
      kind: ConvertIssueKind.MismatchedOvalGrids,
    });
  }
});
