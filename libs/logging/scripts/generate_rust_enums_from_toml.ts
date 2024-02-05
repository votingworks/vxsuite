import toml from '@iarna/toml';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { execFileSync } from 'child_process';
import {
  configFilepath,
  rustEnumsTemplateFilepath,
  rustEnumsOutputFilepath,
} from './filepaths';
import { ParsedConfig, getTypedConfig } from './types';

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

async function main(): Promise<void> {
  const untypedConfig = await toml.parse.stream(
    createReadStream(configFilepath)
  );
  const typedConfig = getTypedConfig(untypedConfig);
  const out = createWriteStream(rustEnumsOutputFilepath);

  await pipeline(async function* makeRustFile() {
    yield* createReadStream(rustEnumsTemplateFilepath);
    yield* formatLogEventIdEnum(typedConfig);
  }, out);

  execFileSync('rustfmt', [rustEnumsOutputFilepath]);
}

void main();
