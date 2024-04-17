import { mockOf } from '@votingworks/test-utils';
import {
  Button,
  H1,
  LanguageSettingsButton,
  LanguageSettingsScreen,
  VoterSettings,
} from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import { VoterScreen } from './voter_screen';
import { VoterSettingsButton } from './voter_settings_button';

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  LanguageSettingsButton: jest.fn(),
  LanguageSettingsScreen: jest.fn(),
  VoterSettings: jest.fn(),
}));

jest.mock(
  './voter_settings_button',
  (): typeof import('./voter_settings_button') => ({
    ...jest.requireActual('./voter_settings_button'),
    VoterSettingsButton: jest.fn(),
  })
);

test('renders language settings button/screen', () => {
  mockOf(LanguageSettingsButton).mockImplementation((props) => (
    <Button data-testid="mockLanguageSettingsButton" onPress={props.onPress} />
  ));

  mockOf(LanguageSettingsScreen).mockImplementation((props) => (
    <div>
      <H1>Language Settings Screen</H1>
      <Button
        data-testid="closeMockLanguageSettingsScreen"
        onPress={props.onDone}
      />
    </div>
  ));

  render(
    <VoterScreen>
      <H1>Some Voter Screen</H1>
    </VoterScreen>
  );

  screen.getByText('Some Voter Screen');
  screen.getByTestId('mockLanguageSettingsButton');
  expect(
    screen.queryByText('Language Settings Screen')
  ).not.toBeInTheDocument();

  //
  // Open the language settings screen:
  //

  userEvent.click(screen.getByTestId('mockLanguageSettingsButton'));

  screen.getByText('Language Settings Screen');
  expect(screen.queryByText('Some Voter Screen')).not.toBeInTheDocument();
  expect(
    screen.queryByTestId('mockLanguageSettingsButton')
  ).not.toBeInTheDocument();

  //
  // Close the language settings screen:
  //

  userEvent.click(screen.getByTestId('closeMockLanguageSettingsScreen'));

  screen.getByText('Some Voter Screen');
  screen.getByTestId('mockLanguageSettingsButton');
  expect(
    screen.queryByText('Language Settings Screen')
  ).not.toBeInTheDocument();
});

test('renders voter settings button/screen', () => {
  mockOf(VoterSettingsButton).mockImplementation((props) => (
    <Button data-testid="mockVoterSettingsButton" onPress={props.onPress} />
  ));

  mockOf(VoterSettings).mockImplementation((props) => (
    <div>
      <H1>Voter Settings Screen</H1>
      <Button
        data-testid="closeMockVoterSettingsScreen"
        onPress={props.onClose}
      />
    </div>
  ));

  render(
    <VoterScreen>
      <H1>Some Voter Screen</H1>
    </VoterScreen>
  );

  screen.getByText('Some Voter Screen');
  screen.getByTestId('mockVoterSettingsButton');
  expect(screen.queryByText('Voter Settings Screen')).not.toBeInTheDocument();

  //
  // Open the voter settings screen:
  //

  userEvent.click(screen.getByTestId('mockVoterSettingsButton'));

  screen.getByText('Voter Settings Screen');
  expect(screen.queryByText('Some Voter Screen')).not.toBeInTheDocument();
  expect(
    screen.queryByTestId('mockVoterSettingsButton')
  ).not.toBeInTheDocument();

  //
  // Close the voter settings screen:
  //

  userEvent.click(screen.getByTestId('closeMockVoterSettingsScreen'));

  screen.getByText('Some Voter Screen');
  screen.getByTestId('mockVoterSettingsButton');
  expect(screen.queryByText('Voter Settings Screen')).not.toBeInTheDocument();
});
