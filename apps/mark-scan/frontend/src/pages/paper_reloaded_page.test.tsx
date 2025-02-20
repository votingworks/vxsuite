import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { createApiMock, ApiMock } from '../../test/helpers/mock_api_client';
import { render, screen } from '../../test/react_testing_library';
import { PaperReloadedPage } from './paper_reloaded_page';
import { RemoveJammedSheetScreen } from './remove_jammed_sheet_screen';

vi.mock(import('./remove_jammed_sheet_screen.js'));

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

beforeEach(() => {
  vi.mocked(RemoveJammedSheetScreen).mockImplementation(() => (
    <div>mockRemoveJammedSheetScreen</div>
  ));
});

test('redirects to /ready-to-review if session already in progress', () => {
  const mockHistory = createMemoryHistory({ initialEntries: ['/contest/0'] });

  render(
    <Router history={mockHistory}>
      <PaperReloadedPage votesSelected />
    </Router>
  );

  screen.getByText('Remove Poll Worker Card');
  expect(mockHistory.location.pathname).toEqual('/ready-to-review');
});

test("no URL change if voting session hasn't started", () => {
  const mockHistory = createMemoryHistory({ initialEntries: ['/contest/0'] });

  render(
    <Router history={mockHistory}>
      <PaperReloadedPage votesSelected={false} />
    </Router>
  );

  screen.getByText('Remove Poll Worker Card');
  expect(mockHistory.location.pathname).toEqual('/');
});
