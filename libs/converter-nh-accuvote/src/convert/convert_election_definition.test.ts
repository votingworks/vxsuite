import { Result, iter, typedAs } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
} from '@votingworks/fixtures';
import {
  BallotPaperSize,
  DistrictIdSchema,
  GridPosition,
  unsafeParse,
} from '@votingworks/types';
import { readFile } from 'fs/promises';
import { pdfToImages } from '@votingworks/image-utils';
import { join } from 'path';
import { readFixtureBallotCardDefinition } from '../../test/fixtures';
import { convertElectionDefinition } from './convert_election_definition';
import { ConvertIssue, ConvertIssueKind, ConvertResult } from './types';

test('converting the Hudson ballot', async () => {
  const hudsonBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateBack.asImageData()
  );
  const converted = convertElectionDefinition([
    hudsonBallotCardDefinition,
  ]).unsafeUnwrap();

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
    convertElectionDefinition([hudsonBallotCardDefinition]).unsafeUnwrap()
      .issues
  ).toEqual(
    expect.arrayContaining([
      typedAs<ConvertIssue>({
        kind: ConvertIssueKind.InvalidTemplateSize,
        message: expect.stringContaining(
          'Template images do not match expected sizes.'
        ),
        paperSize: BallotPaperSize.Letter,
        frontTemplateSize: { width: 1900, height: 3000 },
        backTemplateSize: { width: 1900, height: 3000 },
      }),
    ])
  );
});

test('constitutional question ovals get placed on the grid correctly', async () => {
  const nhTestBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireTestBallotFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.templateBack.asImageData()
  );
  const converted = convertElectionDefinition([
    nhTestBallotCardDefinition,
  ]).unsafeUnwrap();

  // uncomment this to update the fixture
  // require('fs').writeFileSync(
  //   require('path').join(
  //     __dirname,
  //     '../../../fixtures/data/electionGridLayoutNewHampshireTestBallot/election.json'
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
            districtId: unsafeParse(DistrictIdSchema, 'town-id-00701-district'),
            yesOption: {
              id: 'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes',
              label: 'Yes',
            },
            noOption: {
              id: 'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-no',
              label: 'No',
            },
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
                  optionId:
                    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes',
                  sheetNumber: 1,
                  side: 'back',
                  column: 26,
                  row: 24,
                },
                {
                  type: 'option',
                  contestId:
                    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
                  optionId:
                    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-no',
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
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition.election
  );
});

test('converting two party primary ballots into one election (Conway)', async () => {
  const conwayDir = join(__dirname, '../../test/fixtures/conway-primary');
  const [demFront, demBack] = await iter(
    pdfToImages(await readFile(join(conwayDir, 'dem-ballot-template.pdf')), {
      scale: 200 / 72,
    })
  )
    .map(({ page }) => page)
    .toArray();
  const demBallotCardDefinition = readFixtureBallotCardDefinition(
    await readFile(join(conwayDir, 'dem-definition.xml'), 'utf-8'),
    demFront!,
    demBack!
  );

  const [repFront, repBack] = await iter(
    pdfToImages(await readFile(join(conwayDir, 'rep-ballot-template.pdf')), {
      scale: 200 / 72,
    })
  )
    .map(({ page }) => page)
    .toArray();
  const repBallotCardDefinition = readFixtureBallotCardDefinition(
    await readFile(join(conwayDir, 'rep-definition.xml'), 'utf-8'),
    repFront!,
    repBack!
  );

  const converted = convertElectionDefinition([
    demBallotCardDefinition,
    repBallotCardDefinition,
  ]).unsafeUnwrap();

  expect(converted).toMatchSnapshot();
});
