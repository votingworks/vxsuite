import { typedAs } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
} from '@votingworks/fixtures';
import {
  BallotPaperSize,
  DistrictIdSchema,
  Election,
  GridPosition,
  unsafeParse,
} from '@votingworks/types';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import { Buffer } from 'buffer';
import { sliceElectionHash } from '@votingworks/ballot-encoder';
import { readFixtureBallotCardDefinition } from '../../test/fixtures';
import { convertElectionDefinition } from './convert_election_definition';
import { ConvertIssue, ConvertIssueKind } from './types';
import { decodeMetadata } from '../encode_metadata.test';

test('converting the Hudson ballot', async () => {
  const hudsonBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText(),
    electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asBuffer()
  );
  const converted = (
    await convertElectionDefinition([hudsonBallotCardDefinition])
  ).unsafeUnwrap();

  const convertedElection: Election = {
    ...converted.result.electionDefinition.election,
    ballotLayout: {
      ...converted.result.electionDefinition.election.ballotLayout,
      metadataEncoding: 'timing-marks',
    },
  };

  // uncomment this to update the fixture
  // require('fs').writeFileSync(
  //   require('path').join(
  //     __dirname,
  //     '../../../fixtures/data/electionGridLayoutNewHampshireHudson/election.json'
  //   ),
  //   JSON.stringify(convertedElection, null, 2),
  //   'utf8'
  // );

  expect(converted.issues).toEqual([]);
  expect(convertedElection).toEqual(
    electionGridLayoutNewHampshireHudsonFixtures.election
  );
});

test('mismatched ballot image size', async () => {
  const hudsonBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText(),
    electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asBuffer()
  );

  hudsonBallotCardDefinition.definition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

  expect(
    (
      await convertElectionDefinition([hudsonBallotCardDefinition])
    ).unsafeUnwrap().issues
  ).toEqual(
    expect.arrayContaining<ConvertIssue>([
      {
        kind: ConvertIssueKind.InvalidTemplateSize,
        message: expect.stringContaining(
          'Template images do not match expected sizes.'
        ),
        paperSize: BallotPaperSize.Letter,
        frontTemplateSize: { width: 1900, height: 3000 },
        backTemplateSize: { width: 1900, height: 3000 },
      },
    ])
  );
});

test('constitutional question ovals get placed on the grid correctly', async () => {
  const nhTestBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText(),
    electionGridLayoutNewHampshireTestBallotFixtures.templatePdf.asBuffer()
  );
  const converted = (
    await convertElectionDefinition([nhTestBallotCardDefinition])
  ).unsafeUnwrap();
  const convertedElection: Election = {
    ...converted.result.electionDefinition.election,
    ballotLayout: {
      ...converted.result.electionDefinition.election.ballotLayout,
      metadataEncoding: 'timing-marks',
    },
  };

  // uncomment this to update the fixture
  // require('fs').writeFileSync(
  //   require('path').join(
  //     __dirname,
  //     '../../../fixtures/data/electionGridLayoutNewHampshireTestBallot/election.json'
  //   ),
  //   JSON.stringify(convertedElection, null, 2),
  //   'utf8'
  // );

  expect(converted.result.electionDefinition.election).toMatchObject<
    Partial<Election>
  >({
    contests: expect.arrayContaining([
      {
        type: 'yesno',
        id: 'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
        title: 'Constitutional Amendment Question #1',
        description:
          'Shall there be a convention to amend or revise the constitution?',
        districtId: unsafeParse(DistrictIdSchema, 'district-5138f602'),
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
              sheetNumber: 1,
              side: 'back',
              column: 26,
              row: 24,
              contestId:
                'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
              optionId:
                'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-yes',
            },
            {
              type: 'option',
              sheetNumber: 1,
              side: 'back',
              column: 32,
              row: 24,
              contestId:
                'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
              optionId:
                'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc-option-no',
            },
          ])
        ),
      }),
    ],
  });

  expect(convertedElection).toMatchObject(
    electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition.election
  );
});

test('converting two party primary ballots into one election (Conway)', async () => {
  const conwayDir = join(__dirname, '../../test/fixtures/conway-primary');
  const demBallotCardDefinition = readFixtureBallotCardDefinition(
    await readFile(join(conwayDir, 'dem-definition.xml'), 'utf-8'),
    await readFile(join(conwayDir, 'dem-ballot-template.pdf'))
  );

  const repBallotCardDefinition = readFixtureBallotCardDefinition(
    await readFile(join(conwayDir, 'rep-definition.xml'), 'utf-8'),
    await readFile(join(conwayDir, 'rep-ballot-template.pdf'))
  );

  const converted = (
    await convertElectionDefinition([
      demBallotCardDefinition,
      repBallotCardDefinition,
    ])
  ).unsafeUnwrap();

  expect(converted.issues).toMatchSnapshot();
  expect(converted.result.electionDefinition.election).toMatchSnapshot();
  expect(converted.result.ballotPdfs.size).toEqual(2);
  for (const [metadata, pdfs] of converted.result.ballotPdfs) {
    expect(metadata).toMatchSnapshot();

    for await (const page of pdfToImages(Buffer.from(pdfs.printing), {
      scale: 200 / 72,
    })) {
      expect(page.pageCount).toEqual(2);
      expect(toImageBuffer(page.page)).toMatchImageSnapshot();
      expect(
        decodeMetadata(converted.result.electionDefinition.election, page.page)
      ).toEqual({
        ...metadata,
        electionHash: sliceElectionHash(metadata.electionHash),
        pageNumber: page.pageNumber,
      });
    }
  }
});
