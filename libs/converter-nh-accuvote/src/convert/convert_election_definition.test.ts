import { Result, typedAs } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotPaperSize,
  DistrictIdSchema,
  GridPosition,
  unsafeParse,
} from '@votingworks/types';
import { readFixtureBallotCardDefinition } from '../../test/fixtures';
import { convertElectionDefinition } from './convert_election_definition';
import { ConvertIssue, ConvertIssueKind, ConvertResult } from './types';

test('converting the Hudson ballot', async () => {
  const hudsonBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateBack.asImageData()
  );
  const converted = convertElectionDefinition(
    hudsonBallotCardDefinition
  ).unsafeUnwrap();

  // uncomment this to update the fixture
  // require('fs').writeFileSync(
  //   require('path').join(
  //     __dirname,
  //     '../../../fixtures/data/electionGridLayoutNewHampshireHudson/election.json'
  //   ),
  //   JSON.stringify(converted.election, null, 2),
  //   'utf8'
  // );

  const { election } = electionGridLayoutNewHampshireHudsonFixtures;
  expect(converted).toEqual({ election, issues: [] });

  expect(converted.election).toMatchObject(
    electionGridLayoutNewHampshireHudsonFixtures.electionDefinition.election
  );
});

test('mismatched ballot image size', async () => {
  const hudsonBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateBack.asImageData()
  );

  hudsonBallotCardDefinition.definition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

  expect(
    convertElectionDefinition(hudsonBallotCardDefinition).unsafeUnwrap().issues
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

test('default adjudication reasons', async () => {
  const hudsonBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateBack.asImageData()
  );
  const converted = convertElectionDefinition(
    hudsonBallotCardDefinition
  ).unsafeUnwrap();
  expect(converted.election?.centralScanAdjudicationReasons).toEqual(
    typedAs<AdjudicationReason[]>([AdjudicationReason.Overvote])
  );
  expect(converted.election?.precinctScanAdjudicationReasons).toEqual(
    typedAs<AdjudicationReason[]>([AdjudicationReason.Overvote])
  );
});

test('constitutional question ovals get placed on the grid correctly', async () => {
  const amherstBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireAmherstFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireAmherstFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireAmherstFixtures.templateBack.asImageData()
  );
  const converted = convertElectionDefinition(
    amherstBallotCardDefinition
  ).unsafeUnwrap();

  // uncomment this to update the fixture
  // require('fs').writeFileSync(
  //   require('path').join(
  //     __dirname,
  //     '../../../fixtures/data/electionGridLayoutNewHampshireAmherst/election.json'
  //   ),
  //   JSON.stringify(converted.election, null, 2),
  //   'utf8'
  // );

  expect(converted).toEqual(
    typedAs<ConvertResult extends Result<infer T, unknown> ? T : never>({
      issues: expect.any(Array),
      election: expect.objectContaining({
        contests: expect.arrayContaining([
          {
            type: 'yesno',
            id: 'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
            title: 'Constitutional Amendment Question #1',
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
                  sheetNumber: 1,
                  side: 'back',
                  column: 26,
                  row: 24,
                },
                {
                  type: 'option',
                  contestId:
                    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
                  optionId: 'no',
                  sheetNumber: 1,
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

  for (const issue of converted.issues) {
    expect(issue).not.toMatchObject({
      kind: ConvertIssueKind.MismatchedOvalGrids,
    });
  }

  expect(converted.election).toMatchObject(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition.election
  );
});
