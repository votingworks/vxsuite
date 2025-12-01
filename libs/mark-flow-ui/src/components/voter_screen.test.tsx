import { expect, test, vi } from 'vitest';
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

vi.mock('@votingworks/ui', async () => ({
  ...(await vi.importActual('@votingworks/ui')),
  LanguageSettingsButton: vi.fn(),
  LanguageSettingsScreen: vi.fn(),
  VoterSettings: vi.fn(),
}));

vi.mock('./voter_settings_button', async () => ({
  ...(await vi.importActual('./voter_settings_button')),
  VoterSettingsButton: vi.fn(),
}));

test('renders language settings button/screen', () => {
  vi.mocked(LanguageSettingsButton).mockImplementation((props) => (
    <Button data-testid="mockLanguageSettingsButton" onPress={props.onPress} />
  ));

  vi.mocked(LanguageSettingsScreen).mockImplementation((props) => (
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
  vi.mocked(VoterSettingsButton).mockImplementation((props) => (
    <Button data-testid="mockVoterSettingsButton" onPress={props.onPress} />
  ));

  vi.mocked(VoterSettings).mockImplementation((props) => (
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

test('renders voter help button if relevant input is provided', () => {
  function VoterHelpScreen({ onClose }: { onClose: () => void }): JSX.Element {
    return (
      <div>
        <H1>Voter Help Screen</H1>
        <Button onPress={onClose}>Close</Button>
      </div>
    );
  }
  render(
    <VoterScreen VoterHelpScreen={VoterHelpScreen}>
      <H1>Voter Screen</H1>
    </VoterScreen>
  );

  screen.getByRole('heading', { name: 'Voter Screen' });
  userEvent.click(screen.getByRole('button', { name: 'Help' }));
  screen.getByRole('heading', { name: 'Voter Help Screen' });
  userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(
    screen.queryByRole('heading', { name: 'Voter Help Screen' })
  ).not.toBeInTheDocument();
});
