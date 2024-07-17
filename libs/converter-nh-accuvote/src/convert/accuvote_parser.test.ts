import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { readFixtureDefinition } from '../../test/fixtures';
import {
  Candidate,
  Contest,
  Header,
  parseAccuvoteConfig,
  parseCandidate,
  parseCandidateContest,
} from './accuvote_parser';
import { ConvertIssue, ConvertIssueKind } from './types';

test('parseAccuvoteFormat reads election information', () => {
  const root = readFixtureDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
  );
  const config = parseAccuvoteConfig(root).unsafeUnwrap();

  expect(config.header).toEqual<Header>({
    electionDate: '7/12/2022 12:00:00',
    electionName: 'General Election',
    townName: 'Test Ballot',
    townId: '00701',
    electionId: '16716',
    ballotType: 'Regular',
    ballotSize: '8.5X14',
  });
});

test('parseAccuvoteFormat reads contest information', () => {
  const root = readFixtureDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
  );
  const config = parseAccuvoteConfig(root).unsafeUnwrap();

  expect(config.candidateContests).toEqual<Contest[]>([
    {
      office: {
        name: 'Governor',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'Josiah Bartlett',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 245.768,
          isWriteIn: false,
        },
        {
          name: 'Hannah Dustin',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 245.768,
          isWriteIn: false,
        },
        {
          name: 'John Spencer',
          partyName: 'OC',
          pronunciation: 'John Spencer',
          ovalX: 452.126,
          ovalY: 245.768,
          isWriteIn: false,
        },
        {
          name: 'Governor',
          ovalX: 560.126,
          ovalY: 245.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'United States Senator',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'John Langdon',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 281.768,
          isWriteIn: false,
        },
        {
          name: 'William Preston',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 281.768,
          isWriteIn: false,
        },
        {
          name: 'US Senator',
          ovalX: 560.126,
          ovalY: 281.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'Representative in Congress',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'Jeremiah Smith',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 317.768,
          isWriteIn: false,
        },
        {
          name: 'Nicholas Gilman',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 317.768,
          isWriteIn: false,
        },
        {
          name: 'Richard Coote',
          partyName: 'OC',
          pronunciation: 'Richard Coote',
          ovalX: 452.126,
          ovalY: 317.768,
          isWriteIn: false,
        },
        {
          name: 'Rep in Congress',
          ovalX: 560.126,
          ovalY: 335.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'Executive Councilor',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'Anne Waldron',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 371.768,
          isWriteIn: false,
        },
        {
          name: 'Daniel Webster',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 371.768,
          isWriteIn: false,
        },
        {
          name: 'Executive Councilor',
          ovalX: 560.126,
          ovalY: 371.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'State Senator',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'James Poole',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 407.768,
          isWriteIn: false,
        },
        {
          name: 'Matthew Thornton',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 407.768,
          isWriteIn: false,
        },
        {
          name: 'State Senator',
          ovalX: 560.126,
          ovalY: 407.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'State Representatives  Hillsborough District 34',
        winnerNote: 'Vote for not more than 3',
      },
      candidates: [
        {
          name: 'Obadiah Carrigan',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 443.768,
          isWriteIn: false,
        },
        {
          name: 'Mary Baker Eddy',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 461.768,
          isWriteIn: false,
        },
        {
          name: 'Samuel Bell',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 479.768,
          isWriteIn: false,
        },
        {
          name: 'Samuel Livermore',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 443.768,
          isWriteIn: false,
        },
        {
          name: 'Elijah Miller',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 461.768,
          isWriteIn: false,
        },
        {
          name: 'Isaac Hill',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 479.768,
          isWriteIn: false,
        },
        {
          name: 'Abigail Bartlett',
          partyName: 'OC',
          pronunciation: 'Abigail Bartlett',
          ovalX: 452.126,
          ovalY: 443.768,
          isWriteIn: false,
        },
        {
          name: 'Jacob Freese',
          partyName: 'OC',
          pronunciation: 'Jacob Freese',
          ovalX: 452.126,
          ovalY: 479.768,
          isWriteIn: false,
        },
        {
          name: 'State Representative',
          ovalX: 560.126,
          ovalY: 479.768,
          isWriteIn: true,
        },
        {
          name: 'State Representative',
          ovalX: 560.126,
          ovalY: 461.768,
          isWriteIn: true,
        },
        {
          name: 'State Representative',
          ovalX: 560.126,
          ovalY: 443.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'State Representative  Hillsborough District 37',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'Abeil Foster',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 533.768,
          isWriteIn: false,
        },
        {
          name: 'Charles H. Hersey',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 533.768,
          isWriteIn: false,
        },
        {
          name: 'William Lovejoy',
          partyName: 'OC',
          pronunciation: 'William Lovejoy',
          ovalX: 452.126,
          ovalY: 533.768,
          isWriteIn: false,
        },
        {
          name: 'State Representative',
          ovalX: 560.126,
          ovalY: 533.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'Sheriff',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'Edward Randolph',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 569.768,
          isWriteIn: false,
        },
        {
          name: 'Edward Randolph',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 569.768,
          isWriteIn: false,
        },
        {
          name: 'Sheriff',
          ovalX: 560.126,
          ovalY: 569.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'County Attorney',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'Ezra Bartlett',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 605.768,
          isWriteIn: false,
        },
        {
          name: 'Mary Woolson',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 605.768,
          isWriteIn: false,
        },
        {
          name: 'County Attorney',
          ovalX: 560.126,
          ovalY: 605.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'County Treasurer',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'John Smith',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 641.768,
          isWriteIn: false,
        },
        {
          name: 'Jane Jones',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 641.768,
          isWriteIn: false,
        },
        {
          name: 'County Treasurer',
          ovalX: 560.126,
          ovalY: 641.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'Register of Deeds',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'John Mann',
          partyName: 'Democratic',
          pronunciation: 'John Mann',
          ovalX: 236.126,
          ovalY: 677.768,
          isWriteIn: false,
        },
        {
          name: 'Ellen A. Stileman',
          partyName: 'Republican',
          pronunciation: 'Ellen A. Stileman',
          ovalX: 344.126,
          ovalY: 677.768,
          isWriteIn: false,
        },
        {
          name: 'Register of Deeds',
          ovalX: 560.126,
          ovalY: 677.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'Register of Probate',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'Nathaniel Parker',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 713.768,
          isWriteIn: false,
        },
        {
          name: 'Claire Cutts',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 713.768,
          isWriteIn: false,
        },
        {
          name: 'Register of Probate',
          ovalX: 560.126,
          ovalY: 713.768,
          isWriteIn: true,
        },
      ],
    },
    {
      office: {
        name: 'County Commissioner',
        winnerNote: 'Vote for not more than 1',
      },
      candidates: [
        {
          name: 'Ichabod Goodwin',
          partyName: 'Democratic',
          ovalX: 236.126,
          ovalY: 749.768,
          isWriteIn: false,
        },
        {
          name: 'Valbe Cady',
          partyName: 'Republican',
          ovalX: 344.126,
          ovalY: 749.768,
          isWriteIn: false,
        },
        {
          name: 'County Commissioner',
          ovalX: 560.126,
          ovalY: 749.768,
          isWriteIn: true,
        },
      ],
    },
  ]);
});

test('candidates with write-in names are marked as such', () => {
  const root = readFixtureDefinition(
    `<?xml version="1.0" encoding="utf-8"?>
    <CandidateName>
      <Name>Write-In</Name>
      <OX>0</OX>
      <OY>0</OY>
    </CandidateName>`
  );
  const candidate = parseCandidate(root).unsafeUnwrap();
  expect(candidate).toEqual<Candidate>({
    name: 'Write-In',
    ovalX: 0,
    ovalY: 0,
    isWriteIn: true,
  });
});

test('candidates with WriteIn=True are marked as such', () => {
  const root = readFixtureDefinition(
    `<?xml version="1.0" encoding="utf-8"?>
    <CandidateName>
      <Name>John Doe</Name>
      <OX>0</OX>
      <OY>0</OY>
      <WriteIn>True</WriteIn>
    </CandidateName>`
  );
  const candidate = parseCandidate(root).unsafeUnwrap();
  expect(candidate).toEqual<Candidate>({
    name: 'John Doe',
    ovalX: 0,
    ovalY: 0,
    isWriteIn: true,
  });
});

test('missing ElectionId throws an error', () => {
  const root = readFixtureDefinition(
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
  );

  root.getElementsByTagName('ElectionID')[0]!.textContent = '';

  expect(parseAccuvoteConfig(root).unsafeUnwrapErr()).toEqual<ConvertIssue[]>([
    {
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'ElectionID is missing',
      property: 'ElectionID',
    },
  ]);
});

test('missing OfficeName throws an error', () => {
  const root = readFixtureDefinition(
    `<?xml version="1.0" encoding="utf-8"?>
    <Candidates />
    `
  );

  expect(parseCandidateContest(root).unsafeUnwrapErr()).toEqual<ConvertIssue[]>(
    [
      {
        kind: ConvertIssueKind.MissingDefinitionProperty,
        message: 'OfficeName is missing',
        property: 'OfficeName',
      },
    ]
  );
});

test('invalid OX throws an error', () => {
  const root = readFixtureDefinition(
    `<?xml version="1.0" encoding="utf-8"?>
    <CandidateName>
      <Name>John Doe</Name>
      <OX>invalid</OX>
      <OY>0</OY>
    </CandidateName>`
  );

  expect(parseCandidate(root).unsafeUnwrapErr()).toEqual<ConvertIssue[]>([
    {
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'OX is missing or invalid',
      property: 'OX',
    },
  ]);
});

test('invalid OY throws an error', () => {
  const root = readFixtureDefinition(
    `<?xml version="1.0" encoding="utf-8"?>
    <CandidateName>
      <Name>John Doe</Name>
      <OX>0</OX>
      <OY>invalid</OY>
    </CandidateName>`
  );

  expect(parseCandidate(root).unsafeUnwrapErr()).toEqual<ConvertIssue[]>([
    {
      kind: ConvertIssueKind.MissingDefinitionProperty,
      message: 'OY is missing or invalid',
      property: 'OY',
    },
  ]);
});
