import { safeParse } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import yargs from 'yargs/yargs';
import * as fs from 'node:fs';
import { AppName, AppNameSchema } from '../src';
import {
  generateCdfLogDocumentationFileContent,
  generateMarkdownDocumentationContent,
} from '../src/log_documentation';

const DEFAULT_MARKDOWN_LOCATION = 'VotingWorksLoggingDocumentation.md';
const VOTING_WORKS = 'VotingWorks';

function writeCdfDocumentationForApp(
  app: AppName,
  modelName: string,
  outputPath?: string
) {
  const fileContent = generateCdfLogDocumentationFileContent(
    app,
    modelName,
    VOTING_WORKS
  );
  fs.writeFileSync(
    outputPath ?? `${app}-cdf-log-documentation.json`,
    fileContent
  );
}

function writeMarkdownDocumentation(outputPath?: string) {
  const fileContent = generateMarkdownDocumentationContent();
  fs.writeFileSync(outputPath ?? DEFAULT_MARKDOWN_LOCATION, fileContent);
}

interface GenerateDocumentationFileArguments {
  output?: string;
  format: 'cdf' | 'markdown';
  app?: string;
  model?: string;
}
const args: GenerateDocumentationFileArguments = yargs(
  process.argv.slice(2)
).options({
  output: {
    type: 'string',
    alias: 'o',
    description: 'Path to write output file to',
  },
  format: {
    choices: ['cdf', 'markdown'] as const,
    alias: 'f',
    default: 'markdown',
  },
  app: {
    type: 'string',
    description:
      'When writing in the CDF format you must specify which frontend app to build the documentation for.',
  },
  model: {
    type: 'string',
    description:
      'When writing in the CDF format you must specify a model name such as VxAdmin 1.0 .',
  },
}).argv as GenerateDocumentationFileArguments;

function validateAppInput(name?: string): AppName {
  if (name === undefined) {
    process.stderr.write(
      'Specify an app with --app when writing in the CDF format.'
    );
    process.exit(-1);
  }
  const result = safeParse(AppNameSchema, name);
  if (result.isErr()) {
    process.stderr.write(`Invalid input for specified: ${name}`);
    process.exit(-1);
  }
  return result.ok();
}

switch (args.format) {
  case 'cdf': {
    if (args.model === undefined) {
      process.stderr.write(
        'Specify a model name with --model when writing in the CDF format.'
      );
      process.exit(-1);
    }
    writeCdfDocumentationForApp(
      validateAppInput(args.app),
      args.model,
      args.output
    );
    break;
  }
  case 'markdown':
    writeMarkdownDocumentation(args.output);
    break;
  default:
    throwIllegalValue(args.format);
}
