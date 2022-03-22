import { prettyPrinterStateReasons } from './diagnostics_screen';

describe('prettyPrinterStateReasons', () => {
  it('prints a human-friendly message for known reasons', () => {
    expect(prettyPrinterStateReasons(['media-needed-warning'])).toEqual(
      'Warning: The printer is out of paper.'
    );

    expect(prettyPrinterStateReasons(['door-open-error'])).toEqual(
      "Error: The printer's door is open."
    );
    expect(prettyPrinterStateReasons(['stopping-report'])).toEqual(
      'The printer is stopping.'
    );
    expect(prettyPrinterStateReasons(['sleep-mode'])).toEqual(
      'The printer is in sleep mode.'
    );
  });

  it('selects the highest priority reason', () => {
    // This is the real reason list you get when the printer is out of paper
    expect(
      prettyPrinterStateReasons([
        'media-empty-error',
        'media-needed-error',
        'media-empty-error',
      ])
    ).toEqual('Error: The printer is out of paper.');
    // These are made-up cases
    expect(
      prettyPrinterStateReasons([
        'media-empty-report',
        'media-needed-warning',
        'media-jam-error',
      ])
    ).toEqual('Error: The printer has a paper jam.');
    expect(
      prettyPrinterStateReasons(['media-empty-report', 'media-needed-warning'])
    ).toEqual('Warning: The printer has a paper jam.');
  });

  it('returns the plain reason text for unknown reasons', () => {
    expect(
      prettyPrinterStateReasons(['custom-reason-we-didnt-prepare-for-warning'])
    ).toEqual('Warning: custom-reason-we-didnt-prepare-for');
  });

  it('returns empty string on parsing errors', () => {
    expect(prettyPrinterStateReasons([''])).toEqual('');
    expect(prettyPrinterStateReasons(['1234'])).toEqual('');
  });
});
