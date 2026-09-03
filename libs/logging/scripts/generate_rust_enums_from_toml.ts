import toml from '@iarna/toml';
import { assertDefined } from '@votingworks/basics';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import yargs from 'yargs';
import {
  checkRustOutputTempFilepath,
  configFilepath,
  rustEnumsOutputFilepath,
  rustEnumsTemplateFilepath,
} from './filepaths';
import {
  GenerateTypesArgs,
  LoggingConfig,
  diffAndCleanUp,
  parseConfig,
} from './types';

const RUST_STRING_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['\\', '\\\\'],
  ['"', '\\"'],
  ['\n', '\\n'],
  ['\r', '\\r'],
  ['\t', '\\t'],
]);

// Renders `value` as a double-quoted Rust string literal, escaping the
// characters that would otherwise terminate or alter it.
function rustStringLiteral(value: string): string {
  const escaped = value.replace(/[\\"\n\r\t]/g, (char) =>
    assertDefined(RUST_STRING_ESCAPES.get(char))
  );
  return `"${escaped}"`;
}

function* generateLogEventIdEnum(config: LoggingConfig): Generator<string> {
  yield `
  #[macro_export]
  macro_rules! derive_display {
      ($enum_name:ident) => {
          impl ::std::fmt::Display for $enum_name {
              fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
                  self.serialize(f)
              }
          }
      };
  }
  `;

  yield `
    #[derive(Debug, Serialize, Deserialize, Clone, Copy)]
    pub enum AppName {
  `;

  for (const [enumMember, eventType] of config.apps) {
    yield `#[serde(rename = ${rustStringLiteral(eventType.name)})]
      ${enumMember},`;
  }

  yield '}';
  yield 'derive_display!(AppName);';

  yield `
    #[derive(Debug, Serialize, Deserialize, Clone, Copy)]
    pub enum Source {
  `;

  for (const [enumMember, eventType] of config.logSources) {
    yield `#[serde(rename = ${rustStringLiteral(eventType.source)})]
      ${enumMember},`;
  }

  yield '}';
  yield 'derive_display!(Source);';

  yield `
    #[derive(Debug, Serialize, Deserialize, Clone, Copy)]
    pub enum EventType {
  `;

  for (const [enumMember, eventType] of config.eventTypes) {
    yield `#[serde(rename = ${rustStringLiteral(eventType.eventType)})]
      ${enumMember},`;
  }

  yield '}';
  yield 'derive_display!(EventType);';

  yield `
    #[derive(Debug, Serialize, Deserialize, Clone, Copy)]
    pub enum EventId {
  `;

  yield `// A value for use in a Log's Default trait
  #[serde(rename = "unspecified")]
    Unspecified,
  // Generated enum values
  `;

  for (const [enumMember, logDetails] of config.events) {
    yield `#[serde(rename = ${rustStringLiteral(logDetails.eventId)})]
      ${enumMember},`;
  }
  yield '}';
  yield 'derive_display!(EventId);';
}

const argv: GenerateTypesArgs = yargs(process.argv.slice(2))
  .strict()
  .options({
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
  const typedConfig = parseConfig(untypedConfig);
  const out = createWriteStream(filepath);

  await pipeline(async function* makeRustFile() {
    yield* createReadStream(rustEnumsTemplateFilepath);
    yield* generateLogEventIdEnum(typedConfig);
  }, out);

  execFileSync('rustfmt', [filepath]);

  if (check) {
    await diffAndCleanUp(checkRustOutputTempFilepath, rustEnumsOutputFilepath);
  }
}

void main();
