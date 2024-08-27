import { lines } from '@votingworks/basics';
import chalk from 'chalk';
import { unsafeParse } from '@votingworks/types';
import { comment, parseJsonc, softWrapper, string, stripAnsi } from '..';
import { GenerateTestDeckConfigSchema } from '../../convert/types';

const EXAMPLE_CONFIG_STRING = `
{
  ${comment('// electionType: general, primary, etc.')}
  ${string('electionType')}: ${string('general')},
  ${string('jurisdictions')}: [
    {
      ${string('name')}: ${string('Alton')},
      ${comment('// points to the output of the `convert` command')}
      ${string('input')}: ${string('converted/alton')},
      ${string('output')}: ${string('test-decks/alton')}
    },
    {
      ${string('name')}: ${string('Rochester')},
      ${comment('// points to the output of the `convert` command')}
      ${string('input')}: ${string('converted/rochester')},
      ${string('output')}: ${string('test-decks/rochester')}
    }
  ]
}
`.trim();

/**
 * An example configuration for the `generate-test-deck` command.
 *
 * This is primarily here to validate the example config string.
 */
export const EXAMPLE_CONFIG = unsafeParse(
  GenerateTestDeckConfigSchema,
  parseJsonc(stripAnsi(EXAMPLE_CONFIG_STRING)).unsafeUnwrap()
);

const USAGE = `
Usage: generate-test-deck --config <config.json>

${chalk.bold('Summary')}

Generates test decks suitable for testing basic scanning and tabulation of ballot cards for elections as output by the \`convert\` command. 

${chalk.bold('Description')}

Uses a config file to define the inputs and outputs (see example below). The config file may include comments (${comment(
  '// like this'
)} or ${comment('/* this */')}).

The output of this command will include one multi-card PDF for each ballot style in the input.

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
