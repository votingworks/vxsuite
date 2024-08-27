import { render, screen } from '../../test/react_testing_library';
import { Button } from '../button';
import { ScanAudioSection } from './scan_audio_section';

test('renders successful diagnostic results', () => {
  render(
    <ScanAudioSection
      mostRecentAudioDiagnostic={{
        outcome: 'pass',
        timestamp: new Date('2024-01-01T00:00:00').getTime(),
        type: 'scan-audio',
      }}
    />
  );

  screen.getByText('Sound test successful, 1/1/2024, 12:00:00 AM');
});

test('renders failed diagnostic results', () => {
  render(
    <ScanAudioSection
      mostRecentAudioDiagnostic={{
        message: 'This is a Quiet Place.',
        outcome: 'fail',
        timestamp: new Date('2024-01-01T00:00:00').getTime(),
        type: 'scan-audio',
      }}
    />
  );

  screen.getByText(
    'Sound test failed, 1/1/2024, 12:00:00 AM — This is a Quiet Place.'
  );

  render(
    <ScanAudioSection
      mostRecentAudioDiagnostic={{
        outcome: 'fail',
        timestamp: new Date('2024-01-01T00:00:00').getTime(),
        type: 'scan-audio',
      }}
    />
  );

  screen.getByText('Sound test failed, 1/1/2024, 12:00:00 AM');
});

test('renders optional diagnostic controls', () => {
  render(
    <ScanAudioSection
      audioSectionContents={<Button onPress={jest.fn()}>Test Sound</Button>}
    />
  );

  screen.getByText('No sound test on record');
  screen.getButton('Test Sound');
});
