import _ from 'lodash';
import toml from '@iarna/toml';
import fs from 'fs/promises';
import { LogEventId, getDetailsForEventId } from '../src';
import { configDir, configFilepath } from './filepaths';

async function prepareconfigDir(): Promise<void> {
  try {
    await fs.stat(configDir);
    // Dir exists so remove it
    await fs.rmdir(configDir, { recursive: true });
  } catch (e) {
    // Dir does not exist so nothing to do
  }

  await fs.mkdir(configDir);
  await fs.writeFile(
    configFilepath,
    '# Configuration for log event details\n\n'
  );
}

async function main(): Promise<void> {
  const pairs = _.toPairs(LogEventId);
  await prepareconfigDir();
  for (const [key, value] of pairs) {
    const details = getDetailsForEventId(value as LogEventId);
    const serializedObject = {
      [key]: JSON.parse(JSON.stringify(details)),
    } as const;
    await fs.appendFile(
      configFilepath,
      `${toml.stringify(serializedObject)}\n`
    );
  }
}

void main();
