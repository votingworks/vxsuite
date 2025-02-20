import { describe, test } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { ThermalPrinterSection } from './thermal_printer_section';
import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { P } from '../typography';

describe('status message', () => {
  test('idle', async () => {
    render(<ThermalPrinterSection printerStatus={{ state: 'idle' }} />);
    await expectTextWithIcon(
      'The printer is loaded with paper and ready to print.',
      'square-check'
    );
  });

  test('no paper', async () => {
    render(<ThermalPrinterSection printerStatus={{ state: 'no-paper' }} />);
    await expectTextWithIcon(
      'The printer is not loaded with paper.',
      'triangle-exclamation'
    );
  });

  test('cover open', async () => {
    render(<ThermalPrinterSection printerStatus={{ state: 'cover-open' }} />);
    await expectTextWithIcon(
      'The printer roll holder is not attached.',
      'triangle-exclamation'
    );
  });

  test('disconnected', async () => {
    render(
      <ThermalPrinterSection
        printerStatus={{ state: 'error', type: 'disconnected' }}
      />
    );
    await expectTextWithIcon(
      'The printer is disconnected. Please contact support.',
      'triangle-exclamation'
    );
  });

  test('hardware error', async () => {
    render(
      <ThermalPrinterSection
        printerStatus={{ state: 'error', type: 'hardware' }}
      />
    );
    await expectTextWithIcon(
      'The printer has experienced an unknown hardware error. Please contact support.',
      'triangle-exclamation'
    );
  });

  test('supply voltage', async () => {
    render(
      <ThermalPrinterSection
        printerStatus={{ state: 'error', type: 'supply-voltage' }}
      />
    );
    await expectTextWithIcon(
      'The printer is not receiving the appropriate power supply voltage. Please check the power supply.',
      'triangle-exclamation'
    );
  });

  test('temperature', async () => {
    render(
      <ThermalPrinterSection
        printerStatus={{ state: 'error', type: 'temperature' }}
      />
    );
    await expectTextWithIcon(
      'The printer is currently overheated. Please wait for it to cool down before continuing use.',
      'triangle-exclamation'
    );
  });

  test('receive data', async () => {
    render(
      <ThermalPrinterSection
        printerStatus={{ state: 'error', type: 'receive-data' }}
      />
    );
    await expectTextWithIcon(
      'The printer has experienced a data error. Please restart the machine.',
      'triangle-exclamation'
    );
  });
});

describe('PrinterSection diagnostic message', () => {
  test('no diagnostics', () => {
    render(<ThermalPrinterSection printerStatus={{ state: 'idle' }} />);
    screen.getByText('No test print on record');
  });

  const timestamp = new Date('2024-01-01T00:00:00').getTime();

  test('successful diagnostic', () => {
    render(
      <ThermalPrinterSection
        printerStatus={{ state: 'idle' }}
        mostRecentPrinterDiagnostic={{
          type: 'test-print',
          outcome: 'pass',
          timestamp,
        }}
      />
    );
    screen.getByText('Test print successful, 1/1/2024, 12:00:00 AM');
  });

  test('failed diagnostic', () => {
    render(
      <ThermalPrinterSection
        printerStatus={{ state: 'idle' }}
        mostRecentPrinterDiagnostic={{
          type: 'test-print',
          outcome: 'fail',
          timestamp,
        }}
      />
    );
    screen.getByText('Test print failed, 1/1/2024, 12:00:00 AM');
  });

  test('failed diagnostic with message', () => {
    render(
      <ThermalPrinterSection
        printerStatus={{ state: 'idle' }}
        mostRecentPrinterDiagnostic={{
          type: 'test-print',
          outcome: 'fail',
          timestamp,
          message: 'Ran out of paper.',
        }}
      />
    );
    screen.getByText(
      'Test print failed, 1/1/2024, 12:00:00 AM — Ran out of paper.'
    );
  });
});

test('printerActionChildren', () => {
  render(
    <ThermalPrinterSection
      printerStatus={{ state: 'idle' }}
      printerActionChildren={<P>Print test</P>}
    />
  );
  screen.getByText('Print test');
});
