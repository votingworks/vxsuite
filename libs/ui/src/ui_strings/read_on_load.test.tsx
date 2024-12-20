import { assert } from '@votingworks/basics';
import React, { act } from 'react';
import { createMemoryHistory } from 'history';
import { Route, Router } from 'react-router-dom';
import { ReadOnLoad } from './read_on_load';
import { render, screen } from '../../test/react_testing_library';
import { UiStringsAudioContextProvider } from './audio_context';
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

function newRenderer() {
  const mockOnClick = jest.fn();

  function renderWithClickListener(ui: React.ReactNode) {
    return render(<div onClickCapture={mockOnClick}>{ui}</div>);
  }

  return {
    mockOnClick,
    renderWithClickListener,
  };
}

test('is no-op when audio context is absent', () => {
  const { mockOnClick, renderWithClickListener } = newRenderer();

  renderWithClickListener(<ReadOnLoad>Bonjour!</ReadOnLoad>);

  screen.getByText('Bonjour!');
  expect(mockOnClick).not.toHaveBeenCalled();
});

test('triggers click actions on render', () => {
  const { mockOnClick, renderWithClickListener } = newRenderer();

  mockOnClick.mockImplementation((event: MouseEvent) => {
    assert(event.target instanceof HTMLElement);
    expect(event.target.textContent).toEqual('Bonjour!');
  });

  renderWithClickListener(
    <UiStringsAudioContextProvider api={mockUiStringsApi}>
      <ReadOnLoad>Bonjour!</ReadOnLoad>
      <div>Comment allez-vous?</div>
    </UiStringsAudioContextProvider>
  );

  screen.getByText('Bonjour!');
  expect(mockOnClick).toHaveBeenCalled();
});

test('triggers click event on URL change', () => {
  const testHistory = createMemoryHistory();
  testHistory.push('/contests/1');

  const { mockOnClick, renderWithClickListener } = newRenderer();

  mockOnClick.mockImplementation((event: MouseEvent) => {
    assert(event.target instanceof HTMLElement);
    expect(event.target.textContent).toMatch(/^President.?Vote for 1$/);
  });

  renderWithClickListener(
    <UiStringsAudioContextProvider api={mockUiStringsApi}>
      <Router history={testHistory}>
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

test('clears any pre-existing focus first', () => {
  const { mockOnClick, renderWithClickListener } = newRenderer();

  mockOnClick.mockImplementation((event: MouseEvent) => {
    assert(event.target instanceof HTMLElement);
    expect(event.target.textContent).toEqual('Akwaaba!');
  });

  const previouslyFocusedElement = document.createElement('button');
  document.body.appendChild(previouslyFocusedElement);
  previouslyFocusedElement.focus();

  const activeElementBlurSpy = jest.spyOn(previouslyFocusedElement, 'blur');

  renderWithClickListener(
    <UiStringsAudioContextProvider api={mockUiStringsApi}>
      <ReadOnLoad>Akwaaba!</ReadOnLoad>
    </UiStringsAudioContextProvider>
  );

  screen.getByText('Akwaaba!');
  expect(activeElementBlurSpy).toHaveBeenCalled();
  expect(mockOnClick).toHaveBeenCalled();
});
