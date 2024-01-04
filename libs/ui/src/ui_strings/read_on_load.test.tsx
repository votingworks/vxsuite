import { Optional, assert } from '@votingworks/basics';
import { act } from 'react-dom/test-utils';
import React from 'react';
import { createMemoryHistory } from 'history';
import { Route, Router } from 'react-router-dom';
import { ReadOnLoad } from './read_on_load';
import { render, screen } from '../../test/react_testing_library';
import {
  UiStringsAudioContextInterface,
  UiStringsAudioContextProvider,
  useAudioContext,
} from './audio_context';
import {
  UiStringsReactQueryApi,
  createUiStringsApi,
} from '../hooks/ui_strings_api';

const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(() => ({
  getAudioClips: jest.fn(),
  getAvailableLanguages: jest.fn(),
  getUiStringAudioIds: jest.fn(),
  getUiStrings: jest.fn(),
}));

function renderWithClickListener(ui: React.ReactNode) {
  const mockOnClick = jest.fn();
  const result = render(<div onClickCapture={mockOnClick}>{ui}</div>);

  return {
    mockOnClick,
    result,
  };
}

let audioContext: Optional<UiStringsAudioContextInterface>;
function TestContextConsumer() {
  audioContext = useAudioContext();

  return null;
}

afterEach(() => {
  audioContext = undefined;
});

test('is no-op when audio context is absent', () => {
  const { mockOnClick } = renderWithClickListener(
    <ReadOnLoad>Bonjour!</ReadOnLoad>
  );

  screen.getByText('Bonjour!');
  expect(mockOnClick).not.toHaveBeenCalled();
});

test('is no-op when audio playback is disabled', () => {
  const testHistory = createMemoryHistory();

  const { mockOnClick } = renderWithClickListener(
    <UiStringsAudioContextProvider api={mockUiStringsApi}>
      <Router history={testHistory}>
        <TestContextConsumer />
        <ReadOnLoad>Bonjour!</ReadOnLoad>
      </Router>
    </UiStringsAudioContextProvider>
  );

  screen.getByText('Bonjour!');
  expect(audioContext?.isEnabled).toEqual(false);
  expect(mockOnClick).not.toHaveBeenCalled();

  // Should still be a no-op for subsequent URL changes:
  act(() => testHistory.push('/new-url'));
  expect(mockOnClick).not.toHaveBeenCalled();
});

test('triggers click actions on render', () => {
  const { mockOnClick } = renderWithClickListener(
    <UiStringsAudioContextProvider api={mockUiStringsApi}>
      <TestContextConsumer />
      <ReadOnLoad>Bonjour!</ReadOnLoad>
      <div>Comment allez-vous?</div>
    </UiStringsAudioContextProvider>
  );

  screen.getByText('Bonjour!');
  expect(mockOnClick).not.toHaveBeenCalled();

  mockOnClick.mockImplementation((event: MouseEvent) => {
    assert(event.target instanceof HTMLElement);
    expect(event.target.textContent).toEqual('Bonjour!');
  });

  act(() => audioContext?.setIsEnabled(true));

  expect(mockOnClick).toHaveBeenCalled();
});

test('triggers click event on URL change', () => {
  const testHistory = createMemoryHistory();
  testHistory.push('/contests/1');

  const { mockOnClick } = renderWithClickListener(
    <UiStringsAudioContextProvider api={mockUiStringsApi}>
      <Router history={testHistory}>
        <TestContextConsumer />
        <ReadOnLoad>
          <div>
            <Route path="/contests/1">President</Route>
            <Route path="/contests/2">Mayor</Route>
          </div>
          <div>Vote for 1</div>
        </ReadOnLoad>
        <div>Candidate 1</div>
      </Router>
    </UiStringsAudioContextProvider>
  );

  screen.getByText('President');
  expect(mockOnClick).not.toHaveBeenCalled();

  mockOnClick.mockImplementation((event: MouseEvent) => {
    assert(event.target instanceof HTMLElement);
    expect(event.target.textContent).toMatch(/^President.?Vote for 1$/);
  });

  act(() => audioContext?.setIsEnabled(true));

  expect(mockOnClick).toHaveBeenCalled();

  mockOnClick.mockReset();
  mockOnClick.mockImplementation((event: MouseEvent) => {
    assert(event.target instanceof HTMLElement);
    expect(event.target.textContent).toMatch(/^Mayor.?Vote for 1$/);
  });

  act(() => testHistory.push('/contests/2'));

  screen.getByText('Mayor');
  expect(mockOnClick).toHaveBeenCalled();
});
