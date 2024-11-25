import { IppMarkerInfo } from '@votingworks/types';
import { backendWaitFor, mockOf } from '@votingworks/test-utils';
import { assert, err, ok } from '@votingworks/basics';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import {
  CUPS_DEFAULT_IPP_URI,
  IPP_QUERY,
  QueriedIppAttribute,
  getPrinterRichStatus,
} from './status';
import { exec } from '../utils/exec';

jest.mock('../utils/exec');

jest.mock('node:fs/promises', (): typeof import('node:fs/promises') => ({
  ...jest.requireActual('node:fs/promises'),
  writeFile: jest.fn(),
}));

const execMock = mockOf(exec);
const writeFileMock = mockOf(writeFile);

const mockMarkerInfo: IppMarkerInfo = {
  color: '#000000',
  highLevel: 100,
  level: 100,
  lowLevel: 2,
  name: 'black cartridge',
  type: 'toner-cartridge',
};

export function mockIpptoolStdout(
  attributes: {
    [T in QueriedIppAttribute]?: string;
  } = {}
): string {
  return `"/tmp/tmp-122141-YkVU4ekfP1Eg":
      Get-Printer-Attributes:
          attributes-charset (charset) = utf-8
          attributes-natural-language (naturalLanguage) = en
          printer-uri (uri) = ipp://localhost:60000/ipp/print
          requested-attributes (1setOf keyword) = printer-state,printer-state-reasons,marker-names,marker-colors,marker-types,marker-low-levels,marker-high-levels,marker-levels,printer-alert-description
      /tmp/tmp-122141-YkVU4ekfP1Eg                                         [PASS]
          RECEIVED: 395 bytes in response
          status-code = successful-ok (successful-ok)
          attributes-charset (charset) = utf-8
          attributes-natural-language (naturalLanguage) = en
          printer-state ${attributes['printer-state'] ?? '(enum) = idle'}
          printer-state-reasons ${
            attributes['printer-state-reasons'] ?? '(keyword) = none'
          }
          printer-alert-description ${
            attributes['printer-alert-description'] ??
            '(1setOf textWithoutLanguage) = ,Sleep Mode,Ready'
          }
          marker-names ${
            attributes['marker-names'] ??
            '(nameWithoutLanguage) = black cartridge'
          }
          marker-colors ${
            attributes['marker-colors'] ?? '(nameWithoutLanguage) = #000000'
          }
          marker-types ${
            attributes['marker-types'] ?? '(keyword) = toner-cartridge'
          }
          marker-low-levels ${
            attributes['marker-low-levels'] ?? '(integer) = 2'
          }
          marker-high-levels ${
            attributes['marker-high-levels'] ?? '(integer) = 100'
          }
          marker-levels ${attributes['marker-levels'] ?? '(integer) = 100'}
  `;
}

it('uses ipptool to query and parse printer atttributes', async () => {
  execMock.mockResolvedValueOnce(
    ok({
      stdout: mockIpptoolStdout(),
      stderr: '',
    })
  );
  expect(await getPrinterRichStatus(CUPS_DEFAULT_IPP_URI)).toEqual({
    state: 'idle',
    stateReasons: ['none'],
    markerInfos: [mockMarkerInfo],
  });
  expect(execMock).toHaveBeenCalledWith('ipptool', [
    '-T',
    '1',
    '-tv',
    CUPS_DEFAULT_IPP_URI,
    expect.anything(),
  ]);

  // confirm tmp file was written to
  const tmpFilename = (execMock.mock.calls[0][1] as string[]).pop();
  assert(tmpFilename !== undefined);
  expect(tmpFilename.startsWith('/tmp/tmp-')).toEqual(true);
  expect(writeFileMock).toHaveBeenCalledWith(tmpFilename, IPP_QUERY);

  // confirm tmp file was cleaned up
  await backendWaitFor(
    () => {
      expect(existsSync(tmpFilename)).toEqual(false);
    },
    {
      interval: 10,
    }
  );
});

it('parses multiple marker infos', async () => {
  execMock.mockResolvedValueOnce(
    ok({
      stdout: mockIpptoolStdout({
        'marker-names':
          '(1setOf nameWithoutLanguage) = black cartridge,color cartridge',
        'marker-types': '(1setOf keyword) = toner-cartridge,toner-cartridge',
        'marker-colors': '(1setOf nameWithoutLanguage) = #000000,#ffffff',
        'marker-low-levels': '(1setOf integer) = 2,2',
        'marker-high-levels': '(1setOf integer) = 100,100',
        'marker-levels': '(1setOf integer) = 100,83',
      }),
      stderr: '',
    })
  );
  expect(await getPrinterRichStatus()).toEqual({
    state: 'idle',
    stateReasons: ['none'],
    markerInfos: [
      mockMarkerInfo,
      {
        name: 'color cartridge',
        type: 'toner-cartridge',
        color: '#ffffff',
        lowLevel: 2,
        highLevel: 100,
        level: 83,
      },
    ],
  });
});

it('parses multiple printer-state-reasons', async () => {
  execMock.mockResolvedValueOnce(
    ok({
      stdout: mockIpptoolStdout({
        'printer-state': '(enum) = stopped',
        'printer-state-reasons':
          '(1setOf keyword) = media-empty-error,media-needed-error,media-empty-error',
      }),
      stderr: '',
    })
  );
  expect(await getPrinterRichStatus()).toEqual({
    state: 'stopped',
    stateReasons: [
      'media-empty-error',
      'media-needed-error',
      'media-empty-error',
    ],
    markerInfos: [mockMarkerInfo],
  });
});

it('creates a special printer-state-reason if HP sleep mode detected', async () => {
  execMock.mockResolvedValueOnce(
    ok({
      stdout: mockIpptoolStdout({
        'printer-alert-description':
          '(1setOf textWithoutLanguage) = ,Ready,Sleep Mode',
      }),
      stderr: '',
    })
  );
  expect(await getPrinterRichStatus()).toEqual({
    state: 'idle',
    stateReasons: ['sleep-mode'],
    markerInfos: [mockMarkerInfo],
  });
});

it('returns undefined if ipptool fails', async () => {
  execMock.mockResolvedValueOnce(
    err({
      stdout: '',
      stderr: 'ipptool failed',
      code: 1,
      signal: null,
      cmd: 'ipptool',
    })
  );
  expect(await getPrinterRichStatus()).toBeUndefined();
});

it('throws error if ipptool output cannot be parsed', async () => {
  const badOutput = [
    ['', 'Unsuccessful ipptool response: '],
    [
      `"/tmp/tmp-122141-YkVU4ekfP1Eg":
    Get-Printer-Attributes:
        attributes-charset (charset) = utf-8
        attributes-natural-language (naturalLanguage) = en
        printer-uri (uri) = ipp://localhost:60000/ipp/print
        requested-attributes (1setOf keyword) = printer-state,printer-state-reasons,marker-names,marker-colors,marker-types,marker-low-levels,marker-high-levels,marker-levels,printer-alert-description
    /tmp/tmp-122141-YkVU4ekfP1Eg                                         [PASS]
        RECEIVED: 395 bytes in response
        status-code = successful-ok ((null))
  `,
      'Unsuccessful ipptool response: status-code = successful-ok ((null))',
    ],
    [
      `"/tmp/tmp-122141-YkVU4ekfP1Eg":
    Get-Printer-Attributes:
        attributes-charset (charset) = utf-8
        attributes-natural-language (naturalLanguage) = en
        printer-uri (uri) = ipp://localhost:60000/ipp/print
        requested-attributes (1setOf keyword) = printer-state,printer-state-reasons,marker-names,marker-colors,marker-types,marker-low-levels,marker-high-levels,marker-levels,printer-alert-description
    /tmp/tmp-122141-YkVU4ekfP1Eg                                         [PASS]
        RECEIVED: 395 bytes in response`,
      'Unsuccessful ipptool response: <empty>',
    ],
    [
      `"/tmp/tmp-122141-YkVU4ekfP1Eg":
    Get-Printer-Attributes:
        attributes-charset (charset) = utf-8
        attributes-natural-language (naturalLanguage) = en
        printer-uri (uri) = ipp://localhost:60000/ipp/print
        requested-attributes (1setOf keyword) = printer-state,printer-state-reasons,marker-names,marker-colors,marker-types,marker-low-levels,marker-high-levels,marker-levels,printer-alert-description
    /tmp/tmp-122141-YkVU4ekfP1Eg                                         [PASS]
        RECEIVED: 395 bytes in response
        status-code = successful-ok (successful-ok)`,
      'Invalid character set line',
    ],
    [
      `"/tmp/tmp-122141-YkVU4ekfP1Eg":
    Get-Printer-Attributes:
        attributes-charset (charset) = utf-8
        attributes-natural-language (naturalLanguage) = en
        printer-uri (uri) = ipp://localhost:60000/ipp/print
        requested-attributes (1setOf keyword) = printer-state,printer-state-reasons,marker-names,marker-colors,marker-types,marker-low-levels,marker-high-levels,marker-levels,printer-alert-description
    /tmp/tmp-122141-YkVU4ekfP1Eg                                         [PASS]
        RECEIVED: 395 bytes in response
        status-code = successful-ok (successful-ok)
        attributes-charset (charset) = utf-8`,
      'Invalid default language line',
    ],
    [
      mockIpptoolStdout({ 'printer-state': '(enum) = ' }),
      'Unable to parse ipptool output line: printer-state (enum) =',
    ],
    [
      mockIpptoolStdout({ 'printer-state': '(badType) = idle' }),
      'Unsupported IPP attribute type: badType',
    ],
  ];
  for (const [stdout, expectedError] of badOutput) {
    execMock.mockResolvedValueOnce(ok({ stdout, stderr: '' }));
    await expect(getPrinterRichStatus()).rejects.toThrowError(expectedError);
  }
});
