import { safeParse } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';
import yargs from 'yargs/yargs';
import * as fs from 'fs';
import { CLIENT_SIDE_LOG_SOURCES, LogSource, LogSourceSchema } from '../src';
import {
  generateCdfLogDocumentationFileContent,
  generateMarkdownDocumentationContent,
} from '../src/log_documentation';

const DEFAULT_MARKDOWN_LOCATION = 'VotingWorksLoggingDocumentation.md';
const VOTING_WORKS = 'VotingWorks';

function writeCdfDocumentationForApp(
  app: LogSource,
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
  frontend?: string;
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
  frontend: {
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

function validateFrontendInput(frontend?: string): LogSource {
  if (frontend === undefined) {
    process.stderr.write(
      'Specify a frontend app with --frontend when writing in the CDF format.'
    );
    process.exit(-1);
  }
  const result = safeParse(LogSourceSchema, frontend);
  if (result.isErr()) {
    process.stderr.write(
      `Invalid input for frontend app specified: ${frontend}`
    );
    process.exit(-1);
  }
  const logSource = result.ok();
  if (!CLIENT_SIDE_LOG_SOURCES.includes(logSource)) {
    process.stderr.write(
      `${frontend} is not a frontend app, documentation can only be generated for valid frontend apps.`
    );
    process.exit(-1);
  }
  return logSource;
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
      validateFrontendInput(args.frontend),
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
