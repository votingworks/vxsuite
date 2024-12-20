import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  BallotStyle,
  BallotStyleGroupId,
  BallotStyleId,
  District,
  DistrictId,
  Election,
  ElectionDefinition,
  Party,
  PartyId,
  Precinct,
  getContests,
} from '@votingworks/types';
import {
  hasTextAcrossElements,
  mockOf,
  TestLanguageCode,
} from '@votingworks/test-utils';
import { render, screen } from '../../test/react_testing_library';
import { BallotStyleReadinessReport } from './ballot_style_readiness_report';
import {
  ReadinessReportHeader,
  ReadinessReportHeaderProps,
} from './report_header';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionGeneral = electionGeneralDefinition.election;

jest.mock('./report_header');

const { ENGLISH, SPANISH } = TestLanguageCode;

const MOCK_GENERATION_DATE = new Date('2024-01-02, 09:00');

interface BallotStyleSpec {
  districtNames: string[];
  id: BallotStyleId;
  languages: string[];
  partyName?: string;
  precinctNames: string[];
}

function replaceBallotStyles(
  electionDefinition: ElectionDefinition,
  ballotStyleSpecs: BallotStyleSpec[]
): ElectionDefinition {
  const { election } = electionDefinition;
  const newParties: Party[] = [];
  const newDistricts: District[] = [];
  const newPrecincts: Precinct[] = [];
  const newBallotStyles: BallotStyle[] = [];

  for (const spec of ballotStyleSpecs) {
    const districts = spec.districtNames.map<District>((name) => ({
      id: `${spec.id} - district - ${name}` as DistrictId,
      name,
    }));
    const precincts = spec.precinctNames.map<Precinct>((name) => ({
      id: `${spec.id} - precinct - ${name}`,
      name,
    }));
    const party: Party | undefined = spec.partyName
      ? {
          id: `${spec.id} - party - ${name}` as PartyId,
          name: spec.partyName.substring(0, 3),
          fullName: spec.partyName,
          abbrev: spec.partyName.substring(0, 2),
        }
      : undefined;

    newBallotStyles.push({
      districts: districts.map((d) => d.id),
      id: spec.id,
      groupId: spec.id as unknown as BallotStyleGroupId,
      languages: spec.languages,
      precincts: precincts.map((p) => p.id),
      partyId: party?.id,
    });
    newDistricts.push(...districts);
    newPrecincts.push(...precincts);

    if (party) {
      newParties.push(party);
    }
  }

  return {
    ...electionDefinition,
    election: {
      ...electionDefinition.election,
      ballotStyles: newBallotStyles,
      districts: [...election.districts, ...newDistricts],
      precincts: [...election.precincts, ...newPrecincts],
      parties: [...election.parties, ...newParties],
    },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

test('renders report header', () => {
  const { election } = electionGeneralDefinition;
  mockOf(ReadinessReportHeader).mockImplementation((props) => {
    expect(props).toEqual<ReadinessReportHeaderProps>({
      additionalMetadata: [
        { label: 'Election', value: expect.stringContaining(election.title) },
      ],
      generatedAtTime: MOCK_GENERATION_DATE,
      reportType: 'Ballot Style',
    });

    return <div data-testid="MockReportHeader" />;
  });

  render(
    <BallotStyleReadinessReport
      electionDefinition={electionGeneralDefinition}
      generatedAtTime={MOCK_GENERATION_DATE}
    />
  );

  screen.getByTestId('MockReportHeader');
});

test('renders multiple ballot styles', () => {
  render(
    <BallotStyleReadinessReport
      electionDefinition={electionGeneralDefinition}
      generatedAtTime={MOCK_GENERATION_DATE}
    />
  );

  for (const ballotStyle of electionGeneral.ballotStyles) {
    screen.getByRole('heading', { name: `Ballot Style ${ballotStyle.id}` });
  }
});

test('primary election', () => {
  const electionDefinition = replaceBallotStyles(electionGeneralDefinition, [
    {
      districtNames: ['District 10', 'District 2'],
      id: 'ballot-style-1' as BallotStyleId,
      languages: [SPANISH, ENGLISH],
      partyName: 'Pink Party',
      precinctNames: ['Precinct 20', 'Precinct 3'],
    },
  ]);

  render(
    <BallotStyleReadinessReport
      electionDefinition={electionDefinition}
      generatedAtTime={MOCK_GENERATION_DATE}
    />
  );

  screen.getByText(
    hasTextAcrossElements(/Districts:.?District 2.?District 10/)
  );
  screen.getByText(
    hasTextAcrossElements(/Precincts:.?Precinct 3.?Precinct 20/)
  );
  screen.getByText(hasTextAcrossElements(/Language:.?Spanish/));
  screen.getByText(hasTextAcrossElements(/Party:.?Pink Party/));
});

test('general election', () => {
  const electionDefinition = replaceBallotStyles(electionGeneralDefinition, [
    {
      districtNames: ['District 2'],
      id: 'ballot-style-1' as BallotStyleId,
      languages: [ENGLISH],
      precinctNames: ['Precinct 20'],
    },
  ]);

  render(
    <BallotStyleReadinessReport
      electionDefinition={electionDefinition}
      generatedAtTime={MOCK_GENERATION_DATE}
    />
  );

  screen.getByText(hasTextAcrossElements(/Districts:.?District 2/));
  screen.getByText(hasTextAcrossElements(/Precincts:.?Precinct 20/));
  screen.getByText(hasTextAcrossElements(/Language:.?English/));
  expect(
    screen.queryByText(hasTextAcrossElements(/Party:/i))
  ).not.toBeInTheDocument();
});

test('renders contests', () => {
  for (const ballotStyle of electionGeneral.ballotStyles) {
    const election: Election = {
      ...electionGeneralDefinition.election,
      ballotStyles: [ballotStyle],
    };

    const electionDefinition: ElectionDefinition = {
      ...electionGeneralDefinition,
      election,
    };

    const { unmount } = render(
      <BallotStyleReadinessReport
        electionDefinition={electionDefinition}
        generatedAtTime={MOCK_GENERATION_DATE}
      />
    );

    for (const contest of getContests({ ballotStyle, election })) {
      if (contest.type === 'candidate') {
        screen.getByText(
          hasTextAcrossElements(`[Vote for ${contest.seats}] ${contest.title}`)
        );
      } else {
        screen.getByText(contest.title);
      }
    }

    unmount();
  }
});
