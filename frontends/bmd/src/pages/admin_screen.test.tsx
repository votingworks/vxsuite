import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import MockDate from 'mockdate';

import { asElectionDefinition } from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import { render } from '../../test/test_utils';
import { election, defaultPrecinctId } from '../../test/helpers/election';

import { fakePrinter } from '../../test/helpers/fake_printer';
import { advanceTimers } from '../../test/helpers/smartcards';

import { AdminScreen } from './admin_screen';
import { PrintOnly, MarkOnly, PrecinctSelectionKind } from '../config/types';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import {
  AriaScreenReader,
  SpeechSynthesisTextToSpeech,
} from '../utils/ScreenReader';

MockDate.set('2020-10-31T00:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  window.kiosk = fakeKiosk();
});

afterEach(() => {
  window.kiosk = undefined;
});

test('renders AdminScreen for PrintOnly', () => {
  render(
    <AdminScreen
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode={false}
      updateAppPrecinct={jest.fn()}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig({
        appMode: PrintOnly,
        codeVersion: '', // Override default
      })}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  );

  // Configure with Admin Card
  advanceTimers();

  // View Test Ballot Decks
  fireEvent.click(screen.getByText('View Test Ballot Decks'));
  fireEvent.click(
    within(screen.getByTestId('precincts')).getByText('Center Springfield')
  );

  // Back All Decks
  fireEvent.click(screen.getByText('Back to Precincts List'));

  // Single Precinct
  fireEvent.click(screen.getByText('North Springfield'));
  fireEvent.click(screen.getByText('Back to Admin Dashboard'));

  // All Precincts
  fireEvent.click(screen.getByText('View Test Ballot Decks'));
  fireEvent.click(screen.getByText('All Precincts'));
  fireEvent.click(screen.getByText('Back to Admin Dashboard'));
});

test('renders date and time settings modal', async () => {
  render(
    <AdminScreen
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode={false}
      updateAppPrecinct={jest.fn()}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig({
        appMode: MarkOnly,
        codeVersion: 'test',
      })}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  );

  // Configure with Admin Card
  advanceTimers();

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  const startDate = 'Sat, Oct 31, 2020, 12:00 AM UTC';
  screen.getByText(startDate);

  // Open Modal and change date
  fireEvent.click(screen.getByText('Update Date and Time'));

  within(screen.getByTestId('modal')).getByText('Sat, Oct 31, 2020, 12:00 AM');

  const selectYear = screen.getByTestId('selectYear');
  const optionYear =
    within(selectYear).getByText<HTMLOptionElement>('2025').value;
  fireEvent.change(selectYear, { target: { value: optionYear } });

  // Save Date and Timezone
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    fireEvent.click(within(screen.getByTestId('modal')).getByText('Save'));
  });
  expect(window.kiosk?.setClock).toHaveBeenCalledWith({
    isoDatetime: '2025-10-31T00:00:00.000+00:00',
    // eslint-disable-next-line vx/gts-identifiers
    IANAZone: 'UTC',
  });

  // Date is reset to system time after save to kiosk-browser
  screen.getByText(startDate);
});

test('select All Precincts', () => {
  const updateAppPrecinct = jest.fn();
  render(
    <AdminScreen
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode
      updateAppPrecinct={updateAppPrecinct}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig()}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  );

  const precinctSelect = screen.getByLabelText('Precinct');
  const allPrecinctsOption =
    within(precinctSelect).getByText<HTMLOptionElement>('All Precincts');
  fireEvent.change(precinctSelect, {
    target: { value: allPrecinctsOption.value },
  });
  expect(updateAppPrecinct).toHaveBeenCalledWith({
    kind: PrecinctSelectionKind.AllPrecincts,
  });
});

test('blur precinct selector without a selection', () => {
  const updateAppPrecinct = jest.fn();
  render(
    <AdminScreen
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode
      updateAppPrecinct={updateAppPrecinct}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig()}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  );

  const precinctSelect = screen.getByLabelText('Precinct');
  fireEvent.blur(precinctSelect);
  expect(updateAppPrecinct).not.toHaveBeenCalled();
});

test('render All Precincts', () => {
  const updateAppPrecinct = jest.fn();
  render(
    <AdminScreen
      appPrecinct={{ kind: PrecinctSelectionKind.AllPrecincts }}
      ballotsPrintedCount={0}
      electionDefinition={asElectionDefinition(election)}
      fetchElection={jest.fn()}
      isLiveMode
      updateAppPrecinct={updateAppPrecinct}
      toggleLiveMode={jest.fn()}
      unconfigure={jest.fn()}
      machineConfig={fakeMachineConfig()}
      printer={fakePrinter()}
      screenReader={new AriaScreenReader(new SpeechSynthesisTextToSpeech())}
    />
  );

  const precinctSelect = screen.getByLabelText<HTMLSelectElement>('Precinct');
  expect(precinctSelect.selectedOptions[0].textContent).toEqual(
    'All Precincts'
  );
});
