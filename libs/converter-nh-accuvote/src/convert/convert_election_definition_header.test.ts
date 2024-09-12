import { typedAs } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireHudsonFixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import {
  BallotPaperSize,
  CandidateContest,
  PartyIdSchema,
  unsafeParse,
} from '@votingworks/types';
import * as accuvote from './accuvote';
import {
  convertElectionDefinitionHeader,
  parseBallotPaperSize,
} from './convert_election_definition_header';
import { ConvertIssue, ConvertIssueKind } from './types';
import { parseXml } from './dom_parser';

test('letter-size card definition', () => {
  const hudsonBallotCardDefinition = parseXml(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );

  hudsonBallotCardDefinition.getElementsByTagName(
    'BallotSize'
  )[0]!.textContent = '8.5X11';

  const header = convertElectionDefinitionHeader(
    accuvote.parseXml(hudsonBallotCardDefinition).unsafeUnwrap()
  ).unsafeUnwrap();

  expect(header.result.election.ballotLayout.paperSize).toEqual(
    BallotPaperSize.Letter
  );
});

test('multi-party endorsement', () => {
  const nhTestBallotCardDefinition = parseXml(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
  );

  expect(
    convertElectionDefinitionHeader(
      accuvote.parseXml(nhTestBallotCardDefinition).unsafeUnwrap()
    ).unsafeUnwrap().result.election.contests
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining(
        typedAs<Partial<CandidateContest>>({
          id: 'Sheriff-0f76c952',
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
  const nhTestBallotCardDefinition = parseXml(
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

test('parseBallotPaperSize', () => {
  expect(parseBallotPaperSize('8.5X11')).toEqual(BallotPaperSize.Letter);
  expect(parseBallotPaperSize('8.5X14')).toEqual(BallotPaperSize.Legal);
  expect(parseBallotPaperSize('8.5X17')).toEqual(BallotPaperSize.Custom17);
  expect(parseBallotPaperSize('8.5X18')).toEqual(BallotPaperSize.Custom18);
  expect(parseBallotPaperSize('8.5X21')).toEqual(BallotPaperSize.Custom21);
  expect(parseBallotPaperSize('8.5X22')).toEqual(BallotPaperSize.Custom22);
  expect(parseBallotPaperSize('8.5X23')).toEqual(undefined);
  expect(parseBallotPaperSize('11X17')).toEqual(undefined);
});
