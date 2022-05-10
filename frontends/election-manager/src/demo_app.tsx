import { electionSampleDefinition } from '@votingworks/fixtures';
import { Provider } from '@votingworks/types';
import {
  MemoryCard,
  MemoryHardware,
  MemoryStorage,
  Storage,
} from '@votingworks/utils';
import * as React from 'react';
import { App, Props } from './app';
import { AppStorage } from './app_root';
import { MachineConfig } from './config/types';

export function getDemoStorage(): Storage {
  const state: Partial<AppStorage> = {
    electionDefinition: electionSampleDefinition,
    configuredAt: new Date().toISOString(),
  };
  return new MemoryStorage(state);
}

export function getSampleMachineConfigProvider(): Provider<MachineConfig> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async get() {
      return {
        machineId: '012',
        codeVersion: 'demo',
      };
    },
  };
}

export function DemoApp({
  card = new MemoryCard(),
  storage = getDemoStorage(),
  machineConfig = getSampleMachineConfigProvider(),
  hardware,
  ...rest
}: Props): JSX.Element {
  const [internalHardware, setInternalHardware] = React.useState(hardware);
  React.useEffect(() => {
    setInternalHardware((prev) => prev ?? MemoryHardware.buildDemo());
  }, []);
  if (internalHardware === undefined) {
    return <div />;
  }
  return (
    <App
      card={card}
      storage={storage}
      machineConfig={machineConfig}
      hardware={internalHardware}
      bypassAuthentication
      {...rest}
    />
  );
}
