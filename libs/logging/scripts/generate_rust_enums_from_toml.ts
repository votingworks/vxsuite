import toml from '@iarna/toml';
import fs from 'fs/promises';
import {
  configFilepath,
  rustEnumsTemplateFilepath,
  rustEnumsOutputFilepath,
} from './filepaths';
import { ParsedConfig, getTypedConfig } from './types';

async function prepareOutputFile(): Promise<void> {
  await fs.copyFile(rustEnumsTemplateFilepath, rustEnumsOutputFilepath);
}

function formatLogEventIdEnum(config: ParsedConfig): string {
  const entries = Object.entries(config);
  let output = `
    #[derive(Serialize, Deserialize)]
    pub enum EventId {
  `;

  output += `// A value for use in a Log's Default trait
  #[serde(rename = "unspecified")]
    Unspecified,
  // Generated enum values
  `;

  for (const [enumMember, logDetails] of entries) {
    output += `#[serde(rename = "${logDetails.eventId}")]
      ${enumMember},`;
  }
  output += '}';
  return output;
}

async function main(): Promise<void> {
  await prepareOutputFile();

  const configString = await fs.readFile(configFilepath);
  const untypedConfig = toml.parse(configString.toString());
  const typedConfig = getTypedConfig(untypedConfig);
  await fs.appendFile(
    rustEnumsOutputFilepath,
    formatLogEventIdEnum(typedConfig)
  );
}

void main();
