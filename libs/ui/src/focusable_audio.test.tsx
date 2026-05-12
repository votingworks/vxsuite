import { beforeEach, expect, test, vi } from 'vitest';

import { render, screen } from '../test/react_testing_library.js';
import { FocusableAudio } from './focusable_audio';
import { ReadOnLoad, ReadOnLoadProps } from './ui_strings/read_on_load';

vi.mock(import('./ui_strings/read_on_load.js'), async (importActual) => ({
  ...(await importActual()),
  ReadOnLoad: vi.fn(),
}));

const mockReadOnLoad = vi.mocked(ReadOnLoad);
const MOCK_READ_ON_LOAD_TEST_ID = 'mockReadOnLoad';

beforeEach(() => {
  mockReadOnLoad.mockImplementation((props: ReadOnLoadProps) => (
    <div data-testid={MOCK_READ_ON_LOAD_TEST_ID} {...props} />
  ));
});

test('renders with <ReadOnLoad> when `readOnLoad === true`', () => {
  render(<FocusableAudio readOnLoad>some audio content</FocusableAudio>);

  const readOnLoadContainer = screen.getByTestId(MOCK_READ_ON_LOAD_TEST_ID);
  expect(readOnLoadContainer).toHaveTextContent('some audio content');
  expect(readOnLoadContainer).toHaveAttribute('tabindex', '0');
});

test('renders without <ReadOnLoad> when `readOnLoad === false`', () => {
  render(<FocusableAudio>some audio content</FocusableAudio>);

  const container = screen.getByText('some audio content');
  expect(container).toHaveAttribute('tabindex', '0');

  const readOnLoadContainer = screen.queryByTestId(MOCK_READ_ON_LOAD_TEST_ID);
  expect(readOnLoadContainer).not.toBeInTheDocument();
});
