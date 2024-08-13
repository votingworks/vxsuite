import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
} from '@votingworks/fixtures';
import {
  BallotPaperSize,
  CandidateContest,
  DistrictIdSchema,
  PartyIdSchema,
  YesNoContest,
  unsafeParse,
} from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import * as accuvote from './accuvote';
import {
  readFixtureBallotCardDefinition,
  readFixtureDefinition,
} from '../../test/fixtures';
import { convertElectionDefinitionHeader } from './convert_election_definition_header';
import { ConvertIssue, ConvertIssueKind } from './types';

test('letter-size card definition', () => {
  const hudsonBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  hudsonBallotCardDefinition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

  const header = convertElectionDefinitionHeader(
    accuvote.parseXml(hudsonBallotCardDefinition).unsafeUnwrap()
  ).unsafeUnwrap();

  expect(header.result.ballotLayout.paperSize).toEqual(BallotPaperSize.Letter);
});

test('multi-party endorsement', () => {
  const nhTestBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
  );

  expect(
    convertElectionDefinitionHeader(
      accuvote.parseXml(nhTestBallotCardDefinition).unsafeUnwrap()
    ).unsafeUnwrap().result.contests
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

test('missing Party on multi-party endorsement', () => {
  const nhTestBallotCardDefinition = readFixtureDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
  );

  const sheriffElement = Array.from(
    nhTestBallotCardDefinition.getElementsByTagName('Candidates')
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
    convertElectionDefinitionHeader(
      accuvote.parseXml(nhTestBallotCardDefinition).unsafeUnwrap()
    ).unsafeUnwrapErr().issues
  ).toEqual([
    typedAs<ConvertIssue>({
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message:
        'Party is missing in candidate "Edward Randolph" of office "Sheriff", required for multi-party endorsement',
      property: 'AVSInterface > Candidates > CandidateName > Party',
    }),
  ]);
});

test('constitutional questions become yesno contests', () => {
  const nhTestBallotCardDefinition = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText(),
    electionGridLayoutNewHampshireTestBallotFixtures.templatePdf.asBuffer()
  );
  const converted = convertElectionDefinitionHeader(
    accuvote.parseXml(nhTestBallotCardDefinition.definition).unsafeUnwrap()
  ).unsafeUnwrap();

  expect(converted.result.contests.filter((c) => c.type === 'yesno')).toEqual(
    typedAs<YesNoContest[]>([
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
    ])
  );
});
