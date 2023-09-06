import { Buffer } from 'buffer';
import fileDownload from 'js-file-download';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
} from '../test/api_helpers';
import { electionId } from '../test/fixtures';
import { render, screen, waitFor } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ExportScreen } from './export_screen';
import { routes } from './routes';

jest.mock('js-file-download');
const fileDownloadMock = jest.mocked(fileDownload);

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen() {
  render(
    provideApi(
      apiMock,
      withRoute(
        <ExportScreen />,
        routes.election(':electionId').export.path,
        routes.election(electionId).export.path
      )
    )
  );
}

test('export setup package', async () => {
  renderScreen();
  await screen.findByRole('heading', { name: 'Export' });

  apiMock.exportSetupPackage.expectCallWith({ electionId }).resolves({
    zipContents: Buffer.from('fake-zip-contents'),
    electionHash: '1234567890abcdef',
  });

  screen.getButton('Export Setup Package').click();

  await waitFor(() => {
    expect(fileDownloadMock).toHaveBeenCalledWith(
      Buffer.from('fake-zip-contents'),
      'setup-package-1234567890.zip'
    );
  });
});

test('export all ballots', async () => {
  renderScreen();
  await screen.findByRole('heading', { name: 'Export' });

  apiMock.exportAllBallots.expectCallWith({ electionId }).resolves({
    zipContents: Buffer.from('fake-zip-contents'),
    electionHash: '1234567890abcdef',
  });

  screen.getButton('Export All Ballots').click();

  await waitFor(() => {
    expect(fileDownloadMock).toHaveBeenCalledWith(
      Buffer.from('fake-zip-contents'),
      'ballots-1234567890.zip'
    );
  });
});
