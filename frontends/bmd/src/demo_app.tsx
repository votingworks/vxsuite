import * as React from 'react';

import { AdminCardData, Provider, VoterCardData } from '@votingworks/types';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  MemoryCard,
  Storage,
  MemoryStorage,
  MemoryHardware,
} from '@votingworks/utils';
import styled from 'styled-components';
import { Button } from '@votingworks/ui';
import { App, Props as AppProps } from './app';
import { utcTimestamp } from './utils/utc_timestamp';
import {
  MachineConfig,
  PrecinctSelectionKind,
  SerializableActivationData,
  VxMarkPlusVxPrint,
} from './config/types';
import { State } from './app_root';

const BMD_WIDTH = 1920;
const BMD_HEIGHT = 1080;
const DEMO_SCALE = 0.7;

const AppContainer = styled.div`
  @media screen {
    position: absolute;
    left: 100px;
    top: 100px;
    width: ${BMD_WIDTH * DEMO_SCALE}px;
    height: ${BMD_HEIGHT * DEMO_SCALE}px;

    & > * {
      border: 1px solid black;
      zoom: ${DEMO_SCALE};
    }
  }
`;

const ballotStyleId = '12';
const precinctId = '23';
const appPrecinctId = '23';

const voterCardData: VoterCardData = {
  c: utcTimestamp(),
  t: 'voter',
  bs: ballotStyleId,
  pr: precinctId,
};

const adminCardData: AdminCardData = {
  t: 'admin',
  h: electionSampleDefinition.electionHash,
};

export function getSampleCard(): MemoryCard {
  return new MemoryCard().insertCard(JSON.stringify(voterCardData));
}

export function getDemoStorage(): Storage {
  const state: Partial<State> = {
    electionDefinition: electionSampleDefinition,
    appPrecinct: {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: appPrecinctId,
    },
    ballotsPrintedCount: 0,
    isLiveMode: true,
    isPollsOpen: true,
    ballotStyleId,
    isCardlessVoter: false,
    precinctId,
  };
  const activation: SerializableActivationData = {
    ballotStyleId,
    isCardlessVoter: false,
    precinctId,
  };
  return new MemoryStorage({
    state,
    electionDefinition: electionSampleDefinition,
    activation,
  });
}

export function getSampleMachineConfigProvider(): Provider<MachineConfig> {
  return {
    async get() {
      return {
        appMode: VxMarkPlusVxPrint,
        machineId: '012',
        codeVersion: 'demo',
      };
    },
  };
}

export interface Props extends AppProps {
  card?: MemoryCard;
}

/* istanbul ignore next */
export function DemoApp({
  card = getSampleCard(),
  storage = getDemoStorage(),
  machineConfig = getSampleMachineConfigProvider(),
  hardware,
  ...rest
}: Props): JSX.Element {
  const [internalHardware, setInternalHardware] = React.useState(hardware);
  React.useEffect(() => {
    async function updateHardware() {
      if (internalHardware === undefined) {
        setInternalHardware(await MemoryHardware.buildDemo());
      }
    }
    void updateHardware();
  }, [internalHardware]);
  if (internalHardware === undefined) {
    return <div />;
  }

  async function reset(): Promise<void> {
    window.location.replace(`${window.location.origin}/#demo`);
  }

  function removeCard(): void {
    card.removeCard();
  }

  function insertVoterCard(): void {
    card.insertCard(JSON.stringify(voterCardData));
  }

  function insertAdminCard(): void {
    card.insertCard(
      JSON.stringify(adminCardData),
      electionSampleDefinition.electionData
    );
  }

  return (
    <div>
      <Button onPress={reset}>Reset</Button>{' '}
      <Button onPress={removeCard}>Remove Card</Button>{' '}
      <Button onPress={insertVoterCard}>Insert Voter Card</Button>{' '}
      <Button onPress={insertAdminCard}>Insert Admin Card</Button>
      <AppContainer>
        <App
          card={card}
          storage={storage}
          machineConfig={machineConfig}
          hardware={internalHardware}
          {...rest}
        />
      </AppContainer>
    </div>
  );
}
