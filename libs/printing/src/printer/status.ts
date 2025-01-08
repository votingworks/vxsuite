import tmp from 'tmp-promise';
import { Optional, assert } from '@votingworks/basics';
import { writeFile } from 'node:fs/promises';
import {
  IppMarkerInfo,
  IppPrinterState,
  IppPrinterStateReason,
  PrinterRichStatus,
  safeParseInt,
} from '@votingworks/types';
import { exec } from '../utils/exec';
import { rootDebug } from '../utils/debug';

const debug = rootDebug.extend('status');

interface IppAttributes {
  [attribute: string]: string | string[] | number | number[];
}

export const IPP_ATTRIBUTES_TO_QUERY = [
  'printer-state',
  'printer-state-reasons',
  'marker-names',
  'marker-colors',
  'marker-types',
  'marker-low-levels',
  'marker-high-levels',
  'marker-levels',
  'printer-alert-description',
] as const;
export type QueriedIppAttribute = (typeof IPP_ATTRIBUTES_TO_QUERY)[number];
export const IPP_QUERY = `{
        OPERATION Get-Printer-Attributes
        GROUP operation-attributes-tag
        ATTR charset attributes-charset utf-8
        ATTR language attributes-natural-language en
        ATTR uri printer-uri $uri
        ATTR keyword requested-attributes ${IPP_ATTRIBUTES_TO_QUERY.join(',')}
      }`;

/**
 * Parse the output of ipptool. It looks like this:
 *  query-filename:
 *      Get-Printer-Attributes:
 *          attributes-charset (charset) = utf-8
 *          attributes-natural-language (naturalLanguage) = en
 *          printer-uri (uri) = ipp://localhost:60000/ipp/print
 *          requested-attributes (1setOf keyword) = printer-state,printer-state-reasons
 *      query-filename                                                           [PASS]
 *          RECEIVED: 183 bytes in response
 *          status-code = successful-ok (successful-ok)
 *          attributes-charset (charset) = utf-8
 *          attributes-natural-language (naturalLanguage) = en
 *          printer-state (enum) = stopped
 *          printer-state-reasons (1setOf keyword) = media-empty-error,media-needed-error,media-empty-error
 */
function parseIpptoolOutput(output: string): IppAttributes {
  const allLines = output.split('\n');
  assert(allLines.length > 0, 'ipptool output is empty');

  const responseLines = allLines
    .slice(allLines.findIndex((line) => line.trim().startsWith('RECEIVED')) + 1)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const statusLine = responseLines.shift();
  const characterSetLine = responseLines.shift();
  const languageLine = responseLines.shift();
  assert(
    statusLine === 'status-code = successful-ok (successful-ok)',
    `Unsuccessful ipptool response: ${statusLine ?? '<empty>'}`
  );
  assert(
    characterSetLine === 'attributes-charset (charset) = utf-8',
    'Invalid character set line'
  );
  assert(
    languageLine === 'attributes-natural-language (naturalLanguage) = en',
    'Invalid default language line'
  );

  const lineRegex = /^(.+) \((.+)\) = (.+)$/;
  const attributes = responseLines.reduce<IppAttributes>((attrs, line) => {
    const matches = lineRegex.exec(line);
    assert(matches, `Unable to parse ipptool output line: ${line}`);
    const [, attribute, type, value] = matches;
    switch (type) {
      case 'keyword':
      case 'enum':
      case 'nameWithoutLanguage':
      case 'textWithoutLanguage':
        return { ...attrs, [attribute]: value };
      case 'integer':
        return { ...attrs, [attribute]: safeParseInt(value).unsafeUnwrap() };
      case '1setOf keyword':
      case '1setOf enum':
      case '1setOf nameWithoutLanguage':
      case '1setOf textWithoutLanguage':
        return { ...attrs, [attribute]: value.split(',') };
      case '1setOf integer':
        return {
          ...attrs,
          [attribute]: value
            .split(',')
            .map((number) => safeParseInt(number).unsafeUnwrap()),
        };
      /* istanbul ignore next */
      default:
        throw new Error(`Unsupported IPP attribute type: ${type}`);
    }
  }, {});
  return attributes;
}

/**
 * The default IPP URI for CUPS. It only works after CUPS has set up the
 * IPP server for the printer, which is entirely separate from our printer
 * configuration step. It may take a few seconds after connecting the printer.
 */
export const CUPS_DEFAULT_IPP_URI = 'ipp://localhost:60000/ipp/print';

/**
 * Query the printer for its status via IPP.
 */
async function getPrinterIppAttributes(
  printerIppUri: string
): Promise<Optional<IppAttributes>> {
  // ipptool takes a file to specify the query to make, so we write a temporary
  // file with the query text
  const queryFile = await tmp.file();
  await writeFile(queryFile.path, IPP_QUERY);

  const ipptoolArgs = ['-T', '1', '-tv', printerIppUri, queryFile.path];
  debug('getting printer IPP attributes from ipptool, args=%o', ipptoolArgs);
  const ipptoolResult = await exec(`ipptool`, ipptoolArgs);
  void queryFile.cleanup(); // void so we don't block status on the cleanup

  // `ipptool` may fail if the printer was just connected and CUPS hasn't yet
  // set up the IPP server for it. In this case, we just return undefined.
  if (ipptoolResult.isErr()) {
    debug('ipptool failed: %o', ipptoolResult.err().stderr);
    return undefined;
  }

  const { stdout, stderr } = ipptoolResult.ok();
  debug('ipptool stdout:\n%s', stdout);
  debug('ipptool stderr:\n%s', stderr);

  const attributes = parseIpptoolOutput(stdout);
  debug('parsed ipptool attributes: %O', attributes);
  return attributes;
}

function wrapWithArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function zip(...arrays: Array<unknown[]>): Array<unknown[]> {
  return arrays[0].map((_, i) => arrays.map((a) => a[i]));
}

/**
 * Query the printer for its status via IPP. Note that this function is tuned
 * for the HP printer models we currently support and may need to be adjusted
 * for other printers.
 */
export async function getPrinterRichStatus(
  printerIppUri = CUPS_DEFAULT_IPP_URI
): Promise<Optional<PrinterRichStatus>> {
  const attributes = await getPrinterIppAttributes(printerIppUri);
  if (!attributes) return undefined;

  const state = attributes['printer-state'] as IppPrinterState;
  let stateReasons = wrapWithArray(
    attributes['printer-state-reasons']
  ) as IppPrinterStateReason[];

  // On HP printers, printer-alert-description contains a list of the last few
  // status messages shown on the printer screen. When sleep mode is on, this
  // is the only place it shows up, and the printer appears idle (any errors -
  // e.g. "cover open" - are not returned in printer-state-reasons).
  const lastAlert = wrapWithArray(
    attributes['printer-alert-description']
  ).pop();
  if (lastAlert === 'Sleep Mode' && state === 'idle') {
    stateReasons = ['sleep-mode'];
  }

  const markerInfos = zip(
    wrapWithArray(attributes['marker-names']),
    wrapWithArray(attributes['marker-colors']),
    wrapWithArray(attributes['marker-types']),
    wrapWithArray(attributes['marker-low-levels']),
    wrapWithArray(attributes['marker-high-levels']),
    wrapWithArray(attributes['marker-levels'])
  ).map(
    ([name, color, type, lowLevel, highLevel, level]) =>
      ({
        name,
        color,
        type,
        lowLevel,
        highLevel,
        level,
      }) as unknown as IppMarkerInfo
  );

  return { state, stateReasons, markerInfos };
}
