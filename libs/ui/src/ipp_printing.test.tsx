import { IppMarkerInfo } from '@votingworks/types';
import { render, screen, within } from '../test/react_testing_library';
import {
  PrinterRichStatusDisplay,
  parseHighestPriorityIppPrinterStateReason,
} from './ipp_printing';

const mockMarkerInfo: IppMarkerInfo = {
  color: '#000000',
  highLevel: 100,
  level: 100,
  lowLevel: 2,
  name: 'black cartridge',
  type: 'toner-cartridge',
};

describe('parseHighestPriorityIppPrinterStateReason', () => {
  test('ignores "none"', () => {
    expect(parseHighestPriorityIppPrinterStateReason(['none'])).toEqual(
      undefined
    );
  });

  test('shows error over warning', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-warning',
        'media-needed-error',
      ])
    ).toEqual('media-needed');
  });

  test('shows warning over report', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-report',
        'media-needed-warning',
      ])
    ).toEqual('media-needed');
  });

  test('shows first of same level', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-warning',
        'media-needed-warning',
      ])
    ).toEqual('toner-low');
  });

  test('ignores unparseable reasons', () => {
    expect(
      parseHighestPriorityIppPrinterStateReason([
        'toner-low-report',
        'media?-what-media?-warning',
      ])
    ).toEqual('toner-low');
  });
});

async function expectTextWithIcon(text: string, icon: string) {
  const textElement = await screen.findByText(text);
  expect(
    within(textElement.closest('p')!)
      .getByRole('img', {
        hidden: true,
      })
      .getAttribute('data-icon')
  ).toEqual(icon);
}

describe('PrinterRichStatusDisplay', () => {
  test('idle and full toner', async () => {
    render(
      <PrinterRichStatusDisplay
        state="idle"
        stateReasons={['none']}
        markerInfos={[mockMarkerInfo]}
      />
    );

    await expectTextWithIcon('Ready', 'circle-check');
    await expectTextWithIcon('Toner Level: 100%', 'circle-check');
  });

  test('sleep mode and low toner', async () => {
    render(
      <PrinterRichStatusDisplay
        state="idle"
        stateReasons={['sleep-mode']}
        markerInfos={[
          {
            ...mockMarkerInfo,
            level: 1,
          },
        ]}
      />
    );

    await expectTextWithIcon(
      'Ready - The printer is in sleep mode. Press any button on the printer to wake it.',
      'circle-info'
    );
    await expectTextWithIcon('Toner Level: 1%', 'triangle-exclamation');
  });

  test('while printing', async () => {
    render(
      <PrinterRichStatusDisplay
        state="processing"
        stateReasons={['none']}
        markerInfos={[mockMarkerInfo]}
      />
    );

    await expectTextWithIcon('Processing', 'spinner');
  });

  test('while stopped', async () => {
    render(
      <PrinterRichStatusDisplay
        state="stopped"
        stateReasons={['media-low']}
        markerInfos={[mockMarkerInfo]}
      />
    );

    await expectTextWithIcon(
      'Stopped - The printer is low on paper. Add paper to the printer.',
      'triangle-exclamation'
    );
  });

  test('shows unknown state reasons', async () => {
    render(
      <PrinterRichStatusDisplay
        state="stopped"
        stateReasons={['something-random-warning']}
        markerInfos={[mockMarkerInfo]}
      />
    );

    await expectTextWithIcon(
      'Stopped - something-random',
      'triangle-exclamation'
    );
  });
});
