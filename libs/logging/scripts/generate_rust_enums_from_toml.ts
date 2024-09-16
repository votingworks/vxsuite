import toml from '@iarna/toml';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import yargs from 'yargs';
import {
  configFilepath,
  rustEnumsTemplateFilepath,
  rustEnumsOutputFilepath,
  checkRustOutputTempFilepath,
} from './filepaths';
import {
  GenerateTypesArgs,
  ParsedConfig,
  diffAndCleanUp,
  getTypedConfig,
} from './types';

function* formatLogEventIdEnum(config: ParsedConfig): Generator<string> {
  const entries = Object.entries(config);
  yield `
    #[derive(Serialize, Deserialize)]
    pub enum EventId {
  `;

  yield `// A value for use in a Log's Default trait
  #[serde(rename = "unspecified")]
    Unspecified,
  // Generated enum values
  `;

  for (const [enumMember, logDetails] of entries) {
    yield `#[serde(rename = "${logDetails.eventId}")]
      ${enumMember},`;
  }
  yield '}';
}

const argv: GenerateTypesArgs = yargs(process.argv.slice(2)).options({
  check: {
    type: 'boolean',
    description:
      'Check that generated output equals the existing file on disk. Does not overwrite existing file.',
  },
}).argv as GenerateTypesArgs;

async function main(): Promise<void> {
  const { check } = argv;
  const filepath = check
    ? checkRustOutputTempFilepath
    : rustEnumsOutputFilepath;
  const untypedConfig = await toml.parse.stream(
    createReadStream(configFilepath)
  );
  const typedConfig = getTypedConfig(untypedConfig);
  const out = createWriteStream(filepath);

  await pipeline(async function* makeRustFile() {
    yield* createReadStream(rustEnumsTemplateFilepath);
    yield* formatLogEventIdEnum(typedConfig);
  }, out);

  execFileSync('rustfmt', [filepath]);

  if (check) {
    await diffAndCleanUp(checkRustOutputTempFilepath, rustEnumsOutputFilepath);
  }
}

void main();
