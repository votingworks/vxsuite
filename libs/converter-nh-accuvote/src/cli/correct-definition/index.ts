import { err, ok, Result } from '@votingworks/basics';
import chalk from 'chalk';
import { mkdir, rm, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import format from 'xml-formatter';
import { RealIo, Stdio } from '..';
import * as accuvote from '../../convert/accuvote';
import * as correctDefinition from '../../convert/correct_definition';

type CorrectDefinitionOptions =
  | {
      type: 'correct-definition';
      configPath: string;
    }
  | {
      type: 'help';
    };

/**
 * Turns command-line arguments into options for the `correct-definition`
 * command to determine how to run.
 */
function parseOptions(
  args: readonly string[]
): Result<CorrectDefinitionOptions, Error> {
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '-c':
      case '--config': {
        const nextArg = args[i + 1];
        if (nextArg === undefined) {
          return err(new Error(`missing config path after ${arg}`));
        }
        configPath = nextArg;
        i += 1;
        break;
      }

      case '-h':
      case '--help':
        return ok({ type: 'help' });

      default:
        return err(new Error(`unexpected argument: ${arg}`));
    }
  }

  if (!configPath) {
    return err(new Error('missing config path'));
  }

  return ok({
    type: 'correct-definition',
    configPath,
  });
}

function usage(out: NodeJS.WritableStream): void {
  function s(str: string) {
    return chalk.green(JSON.stringify(str));
  }
  function c(comment: string) {
    return chalk.dim(comment);
  }
  function n(number: number): string {
    return chalk.yellow(number.toString());
  }
  const brace = '{';
  const bracket = '[';
  const rbrace = '}';
  const rbracket = ']';

  out.write(`Usage: correct-definition --config <config-path>\n`);
  out.write(`\n`);
  out.write(
    chalk.italic(`Corrects an AccuVote definition file based on the PDF.\n`)
  );
  out.write(`\n`);
  out.write(chalk.bold.underline(`Config File Format:\n`));
  out.write(`\n`);
  out.write(`${brace}\n`);
  out.write(`  ${s('cards')}: ${bracket}\n`);
  out.write(`    ${brace}\n`);
  out.write(
    `      ${c('// Required: path to the AccuVote definition file')}\n`
  );
  out.write(`      ${s('definitionPath')}: ${s('definition.xml')},\n`);
  out.write(`\n`);
  out.write(`      ${c('// Required: path to the ballot PDF file')}\n`);
  out.write(`      ${s('pdfPath')}: ${s('ballot.pdf')},\n`);
  out.write(`\n`);
  out.write(`      ${c('// Required: output directory')}\n`);
  out.write(`      ${s('outputDir')}: ${s('output')}\n`);
  out.write(`\n`);
  out.write(
    `      ${c('// Optional: page numbers (1-based, defaults to 1 & 2,')}\n`
  );
  out.write(
    `      ${c('// useful for PDFs containing multiple ballot cards)')}\n`
  );
  out.write(`      ${s('frontPage')}: ${n(3)},\n`);
  out.write(`      ${s('backPage')}: ${n(4)},\n`);
  out.write(`    ${rbrace}\n`);
  out.write(`  ${rbracket}\n`);
  out.write(`${rbrace}\n`);
  out.write(`\n`);
  out.write(`All paths are relative to the config file or absolute.\n`);
}

/**
 * Corrects an AccuVote definition file based on the PDF.
 */
export async function main(
  args: readonly string[],
  /* istanbul ignore next */
  io: Stdio = RealIo
): Promise<number> {
  const parseResult = parseOptions(args);

  if (parseResult.isErr()) {
    io.stderr.write(`Error: ${parseResult.err().message}\n`);
    usage(io.stderr);
    return 1;
  }

  const options = parseResult.ok();

  if (options.type === 'help') {
    usage(io.stdout);
    return 0;
  }

  const { configPath } = options;
  const readConfigFileResult =
    await correctDefinition.readConfigFile(configPath);

  if (readConfigFileResult.isErr()) {
    io.stderr.write(
      `Error: invalid config file: ${readConfigFileResult.err().message}\n`
    );
    usage(io.stderr);
    return 1;
  }

  const config = readConfigFileResult.ok();

  for (const card of config.resolved.cards) {
    const { input } = card;
    const correctedDefinition = (
      await correctDefinition.correctCandidateCoordinates(card)
    ).unsafeUnwrap();

    const correctedXmlString = accuvote.toXml(correctedDefinition);
    const outputDir = join(dirname(configPath), input.outputDir);
    const correctedDefinitionPath = join(
      outputDir,
      basename(input.definitionPath)
    );

    await rm(outputDir, { force: true, recursive: true });
    await mkdir(outputDir, { recursive: true });
    io.stdout.write(`📝 ${correctedDefinitionPath}\n`);
    await writeFile(
      correctedDefinitionPath,
      format(correctedXmlString, {
        indentation: '  ',
        collapseContent: true,
      })
    );

    if (card.proofPages) {
      const proofPdfPath = join(outputDir, `PROOF-${basename(input.pdfPath)}`);

      io.stdout.write(`📝 ${proofPdfPath}\n`);
      await writeFile(proofPdfPath, await card.proofPages[0].doc.save());
    }
  }

  return 0;
}
