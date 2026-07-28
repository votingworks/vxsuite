import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import {
  BallotType,
  HmpbBallotPaperSize,
  ElectionId,
  DEFAULT_SYSTEM_SETTINGS,
  LanguageCode,
} from '@votingworks/types';
import type {
  BallotTemplateId,
  ElectionRecord,
} from '@votingworks/design-backend';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
  jurisdiction,
  user,
  mockUserFeatures,
  mockStateFeatures,
} from '../test/api_helpers';
import {
  electionInfoFromRecord,
  generalElectionRecord,
  combinedBallotPrimaryElectionRecord,
  primaryElectionRecord,
} from '../test/fixtures';
import { render, screen, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { BallotsScreen } from './ballots_screen';
import { routes } from './routes';
import { BallotsStatus } from './ballots_status';

vi.mock('./ballots_status');
const MockBallotsStatus = vi.mocked(BallotsStatus);
const MOCK_BALLOTS_STATUS_ID = 'MockBallotsStatus';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);

  MockBallotsStatus.mockReturnValue(
    <div data-testid={MOCK_BALLOTS_STATUS_ID} />
  );
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(
  electionId: ElectionId,
  history = createMemoryHistory({
    initialEntries: [routes.election(electionId).ballots.root.path],
  })
) {
  render(
    provideApi(
      apiMock,
      withRoute(<BallotsScreen />, {
        paramPath: routes.election(':electionId').ballots.root.path,
        path: routes.election(electionId).ballots.root.path,
        history,
      })
    )
  );
}

function expectElectionApiCalls(
  electionRecord: ElectionRecord,
  ballotTemplateId: BallotTemplateId = 'VxDefaultBallot'
) {
  const { id: electionId } = electionRecord.election;
  mockStateFeatures(apiMock, electionId);
  apiMock.listBallotStyles
    .expectCallWith({ electionId })
    .resolves(electionRecord.election.ballotStyles);
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(electionRecord.election.precincts);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromRecord(electionRecord));
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.listParties
    .expectCallWith({ electionId })
    .resolves(electionRecord.election.parties);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves(ballotTemplateId);
}

describe('Ballot styles tab', () => {
  test('General election with splits', async () => {
    const electionRecord = generalElectionRecord(jurisdiction.id);
    const electionId = electionRecord.election.id;
    expectElectionApiCalls(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    screen.getByRole('tab', { name: 'Ballot Styles', selected: true });
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Precinct',
      'Ballot Style',
      '',
    ]);

    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent)
        )
    ).toEqual([
      ['Center Springfield', '1_en', 'View Ballot'],
      ['North Springfield', '', ''],
      ['North Springfield - Split 1', '2_en', 'View Ballot'],
      ['North Springfield - Split 2', '1_en', 'View Ballot'],
      ['South Springfield', 'No contests assigned', ''],
    ]);
  });

  test('CA ballot template shows one row per ballot style group', async () => {
    const record = generalElectionRecord(jurisdiction.id);
    const electionRecord: ElectionRecord = {
      ...record,
      election: {
        ...record.election,
        ballotStyles: record.election.ballotStyles.flatMap((ballotStyle) => [
          ballotStyle,
          {
            ...ballotStyle,
            id: ballotStyle.id.replace('_en', '_es-US'),
            languages: [LanguageCode.SPANISH],
          },
          {
            ...ballotStyle,
            id: ballotStyle.id.replace('_en', '_zh-Hans'),
            languages: [LanguageCode.CHINESE_SIMPLIFIED],
          },
        ]),
      },
    };
    const electionId = electionRecord.election.id;
    expectElectionApiCalls(electionRecord, 'CaBallot');
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    const history = createMemoryHistory({
      initialEntries: [routes.election(electionId).ballots.root.path],
    });
    renderScreen(electionId, history);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent)
        )
    ).toEqual([
      ['Center Springfield', '1', 'View Ballot'],
      ['North Springfield', '', ''],
      ['North Springfield - Split 1', '2', 'View Ballot'],
      ['North Springfield - Split 2', '1', 'View Ballot'],
      ['South Springfield', 'No contests assigned', ''],
    ]);

    // Viewing a ballot opens the group's first translated variant (the
    // English-only variant is not shown for the CA template)
    const centerSpringfield = electionRecord.election.precincts[0];
    apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
      paperSize: electionRecord.election.ballotLayout.paperSize,
      compact: false,
    });
    apiMock.getBallotPreviewPdf
      .expectCallWith({
        electionId,
        ballotStyleId: '1_zh-Hans',
        precinctId: centerSpringfield.id,
        ballotType: BallotType.Precinct,
        ballotMode: 'official',
        isFederalOfficeOnly: undefined,
      })
      .returns(new Promise(() => {}));
    const firstRow = within(table).getAllByRole('row')[1];
    userEvent.click(
      within(firstRow).getByRole('button', { name: 'View Ballot' })
    );
    await screen.findByRole('heading', { name: 'View Ballot' });
    expect(history.location.pathname).toEqual(
      routes
        .election(electionId)
        .ballots.viewBallot('1_zh-Hans', centerSpringfield.id).path
    );
  });

  test('Primary election with splits', async () => {
    const electionRecord = primaryElectionRecord(jurisdiction.id);
    const electionId = electionRecord.election.id;
    expectElectionApiCalls(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    screen.getByRole('tab', { name: 'Ballot Styles', selected: true });
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Precinct',
      'Ballot Style',
      'Party',
      '',
    ]);

    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent)
        )
    ).toEqual([
      ['Precinct 1', '1-Ma_en', 'Mammal Party', 'View Ballot'],
      ['Precinct 1', '1-F_en', 'Fish Party', 'View Ballot'],
      ['Precinct 2', '1-Ma_en', 'Mammal Party', 'View Ballot'],
      ['Precinct 2', '1-F_en', 'Fish Party', 'View Ballot'],
      ['Precinct 3', '2-Ma_en', 'Mammal Party', 'View Ballot'],
      ['Precinct 3', '2-F_en', 'Fish Party', 'View Ballot'],
      ['Precinct 4', '', '', ''],
      ['Precinct 4 - Split 1', '3-Ma_en', 'Mammal Party', 'View Ballot'],
      ['Precinct 4 - Split 1', '3-F_en', 'Fish Party', 'View Ballot'],
      ['Precinct 4 - Split 2', '4-Ma_en', 'Mammal Party', 'View Ballot'],
      ['Precinct 4 - Split 2', '4-F_en', 'Fish Party', 'View Ballot'],
    ]);
  });

  test('Combined ballot primary election hides party column', async () => {
    const electionRecord = combinedBallotPrimaryElectionRecord(jurisdiction.id);
    const electionId = electionRecord.election.id;
    expectElectionApiCalls(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Precinct',
      'Ballot Style',
      '',
    ]);

    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent)
        )
    ).toEqual([
      ['Precinct 1', '1_en', 'View Ballot'],
      ['Precinct 2', '2_en', 'View Ballot'],
    ]);
  });

  test('Precincts/splits with no ballot styles show a message', async () => {
    const record = generalElectionRecord(jurisdiction.id);
    const electionRecord: ElectionRecord = {
      ...record,
      election: {
        ...record.election,
        ballotStyles: record.election.ballotStyles.filter(
          (ballotStyle) => ballotStyle.id === '2_en'
        ),
      },
    };
    const electionId = electionRecord.election.id;
    expectElectionApiCalls(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent)
        )
    ).toEqual([
      ['Center Springfield', 'No contests assigned', ''],
      ['North Springfield', '', ''],
      ['North Springfield - Split 1', '2_en', 'View Ballot'],
      ['North Springfield - Split 2', 'No contests assigned', ''],
      ['South Springfield', 'No contests assigned', ''],
    ]);
  });

  test('renders ballots status', async () => {
    const electionRecord = generalElectionRecord(jurisdiction.id);
    const electionId = electionRecord.election.id;

    expectElectionApiCalls(electionRecord);
    apiMock.getBallotsFinalizedAt
      .expectOptionalRepeatedCallsWith({ electionId })
      .resolves(null);

    renderScreen(electionId);

    await screen.findByTestId(MOCK_BALLOTS_STATUS_ID);
  });
});

describe('Ballot layout tab', () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;

  function setup(ballotTemplateId: BallotTemplateId = 'VxDefaultBallot') {
    expectElectionApiCalls(electionRecord, ballotTemplateId);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  }

  test('has form to update paper size and density', async () => {
    setup();
    mockStateFeatures(apiMock, electionId, {
      ONLY_LETTER_AND_LEGAL_PAPER_SIZES: false,
    });
    apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
      paperSize: election.ballotLayout.paperSize,
      compact: false,
    });
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));

    const paperSizeRadioGroup = await screen.findByRole('radiogroup', {
      name: 'Paper Size',
    });

    // Paper size initial state
    for (const optionName of [
      '8.5 x 11 inches (Letter)',
      '8.5 x 14 inches (Legal)',
      '8.5 x 17 inches',
      '8.5 x 18 inches',
      '8.5 x 19 inches',
      '8.5 x 20 inches',
      '8.5 x 22 inches',
    ]) {
      expect(
        within(paperSizeRadioGroup).getByRole('radio', {
          name: optionName,
        })
      ).toBeDisabled();
    }
    expect(
      within(paperSizeRadioGroup).getByLabelText('8.5 x 11 inches (Letter)')
    ).toBeChecked();

    const densityRadioGroup = await screen.findByRole('radiogroup', {
      name: 'Density',
    });

    // Density initial state
    for (const optionName of ['Default', 'Compact']) {
      expect(
        within(densityRadioGroup).getByRole('radio', {
          name: optionName,
        })
      ).toBeDisabled();
    }
    expect(within(densityRadioGroup).getByLabelText('Default')).toBeChecked();

    // Edit
    userEvent.click(screen.getByRole('button', { name: /Edit/ }));

    userEvent.click(screen.getByLabelText('8.5 x 17 inches'));
    expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();
    userEvent.click(screen.getByLabelText('Compact'));
    expect(screen.getByLabelText('Compact')).toBeChecked();

    // Save
    apiMock.updateBallotLayoutSettings
      .expectCallWith({
        electionId,
        paperSize: HmpbBallotPaperSize.Custom17,
        compact: true,
      })
      .resolves();
    apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
      paperSize: HmpbBallotPaperSize.Custom17,
      compact: true,
    });
    userEvent.click(screen.getByRole('button', { name: /Save/ }));
    await screen.findByRole('button', { name: /Edit/ });

    expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();
    expect(screen.getByLabelText('Compact')).toBeChecked();
  });

  test('with ONLY_LETTER_AND_LEGAL_PAPER_SIZES feature flag enabled', async () => {
    setup();
    mockStateFeatures(apiMock, electionId, {
      ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true,
    });
    apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
      paperSize: election.ballotLayout.paperSize,
      compact: false,
    });
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));

    const paperSizeRadioGroup = await screen.findByRole('radiogroup', {
      name: 'Paper Size',
    });

    // Paper size initial state
    for (const optionName of [
      '8.5 x 11 inches (Letter)',
      '8.5 x 14 inches (Legal)',
    ]) {
      expect(
        within(paperSizeRadioGroup).getByRole('radio', {
          name: optionName,
        })
      ).toBeDisabled();
    }
    expect(
      within(paperSizeRadioGroup).getByLabelText('8.5 x 11 inches (Letter)')
    ).toBeChecked();
  });

  test('hides density for MI ballot template', async () => {
    setup('MiBallot');
    mockStateFeatures(apiMock, electionId, {});
    apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
      paperSize: election.ballotLayout.paperSize,
      compact: false,
    });
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));

    await screen.findByRole('radiogroup', { name: 'Paper Size' });
    expect(
      screen.queryByRole('radiogroup', { name: 'Density' })
    ).not.toBeInTheDocument();
  });

  test('hides density for NH state ballot template', async () => {
    setup('NhStateBallot');
    mockStateFeatures(apiMock, electionId, {});
    apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
      paperSize: election.ballotLayout.paperSize,
      compact: false,
    });
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));

    await screen.findByRole('radiogroup', { name: 'Paper Size' });
    expect(
      screen.queryByRole('radiogroup', { name: 'Density' })
    ).not.toBeInTheDocument();
  });

  test('cancelling', async () => {
    setup();
    mockStateFeatures(apiMock, electionId, {});
    mockUserFeatures(apiMock, {});
    apiMock.getBallotLayoutSettings.expectCallWith({ electionId }).resolves({
      paperSize: election.ballotLayout.paperSize,
      compact: false,
    });
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));
    userEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    expect(screen.getByLabelText('8.5 x 11 inches (Letter)')).toBeChecked();
    userEvent.click(screen.getByLabelText('8.5 x 14 inches (Legal)'));
    expect(screen.getByLabelText('8.5 x 14 inches (Legal)')).toBeChecked();
    userEvent.click(screen.getByLabelText('Compact'));
    expect(screen.getByLabelText('Compact')).toBeChecked();

    userEvent.click(await screen.findByRole('button', { name: /Cancel/ }));
    screen.getByRole('button', { name: /Edit/ });
    expect(screen.getByLabelText('8.5 x 11 inches (Letter)')).toBeChecked();
    expect(screen.getByLabelText('8.5 x 14 inches (Legal)')).not.toBeChecked();
    expect(screen.getByLabelText('Default')).toBeChecked();
    expect(screen.getByLabelText('Compact')).not.toBeChecked();
  });
});
