import { lines } from '@votingworks/basics';
import { unsafeParse } from '@votingworks/types';
import chalk from 'chalk';
import {
  comment,
  number,
  parseJsonc,
  softWrapper,
  string,
  stripAnsi,
} from '..';
import { ConvertConfigSchema } from '../../convert/types';

const EXAMPLE_CONFIG_STRING = `
{
  ${comment('// electionType: general, primary, etc.')}
  ${string('electionType')}: ${string('general')},
  ${string('jurisdictions')}: [
    ${comment('// single-card jurisdiction')}
    {
      ${string('name')}: ${string('Alton')},
      ${string('cards')}: [
        {
          ${string('definition')}: ${string('input/alton/definition.xml')},
          ${string('ballot')}: ${string('input/alton/ballot.pdf')}
        }
      ],
      ${string('output')}: ${string('output/alton')}
    },
    ${comment('// multi-card jurisdiction')}
    {
      ${string('name')}: ${string('Rochester')},
      ${string('cards')}: [
        {
          ${string('definition')}: ${string('input/rochester/card1.xml')},
          ${string('ballot')}: ${string('input/rochester/ballot.pdf')},
          ${comment('// optional: useful for multi-card PDFs')}
          ${string('pages')}: [${number(1)}, ${number(2)}]
        },
        {
          ${string('definition')}: ${string('input/rochester/card2.xml')},
          ${string('ballot')}: ${string('input/rochester/ballot.pdf')},
          ${comment('// optional: useful for multi-card PDFs')}
          ${string('pages')}: [${number(3)}, ${number(4)}]
        }
      ],
      ${string('output')}: ${string('output/rochester')}
    }
  ]
}
`.trim();

/**
 * An example configuration for the convert command.
 *
 * This is primarily here to validate the example config string.
 */
export const EXAMPLE_CONFIG = unsafeParse(
  ConvertConfigSchema,
  parseJsonc(stripAnsi(EXAMPLE_CONFIG_STRING)).unsafeUnwrap()
);

const USAGE = `
Usage: convert --config <config.json>

${chalk.bold('Summary')}

Converts a series of New Hampshire ballot cards into election definitions in the VotingWorks format.

${chalk.bold('Description')}

Uses a config file to define the inputs and outputs (see example below). The config file may include comments (${comment(
  '// like this'
)} or ${comment(
  '/* this */'
)}). Note that if the input data is incorrect then the output will likely be incorrect as well. This tool can correct certain mistakes in the AccuVote XML, such as bubble positions that are slightly off, but cannot correct more egregious errors:

  1. Candidates/contest options in the wrong column.
  2. Candidates/contest options in the wrong order.
  3. Missing timing marks.
  4. Missing contest option bubbles.

The output of this command will include two PDFs for each ballot style, one for printing and one for proofing:
• ${chalk.underline(
  'PRINT PDFs'
)} include a QR code that enables scanning by VxScan or VxCentralScan
• ${chalk.underline('PROOF PDFs')} overlay bubble and contest option locations

${chalk.italic.underline.red(
  `Please review ALL the PDFs labeled PROOF to ensure correctness!`
)}

${chalk.bold('Example Config')}

${EXAMPLE_CONFIG_STRING}
`.trim();

/**
 * Prints the usage information for the `convert` command.
 */
export function usage(out: NodeJS.WritableStream): void {
  for (const line of lines(USAGE).flatMap(softWrapper(80))) {
    out.write(`${line}\n`);
  }
}
