import * as React from 'react'

import { Provider, VoterCardData } from '@votingworks/types'
import { electionSampleDefinition } from '@votingworks/fixtures'
import {
  Card,
  MemoryCard,
  Storage,
  MemoryStorage,
  MemoryHardware,
} from '@votingworks/utils'
import App, { Props } from './App'
import utcTimestamp from './utils/utcTimestamp'
import {
  MachineConfig,
  PrecinctSelectionKind,
  SerializableActivationData,
  VxMarkPlusVxPrint,
} from './config/types'
import { State } from './AppRoot'

const ballotStyleId = '12'
const precinctId = '23'
const appPrecinctId = '23'

export function getSampleCard(): Card {
  const voterCardData: VoterCardData = {
    c: utcTimestamp(),
    t: 'voter',
    bs: ballotStyleId,
    pr: precinctId,
  }

  return new MemoryCard().insertCard(JSON.stringify(voterCardData))
}

export function getDemoStorage(): Storage {
  const state: Partial<State> = {
    ballotStyleId,
    precinctId,
    electionDefinition: electionSampleDefinition,
    appPrecinct: {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: appPrecinctId,
    },
    ballotsPrintedCount: 0,
    isLiveMode: true,
    isPollsOpen: true,
    isCardlessVoter: false,
  }
  const activation: SerializableActivationData = {
    ballotStyleId,
    precinctId,
    isCardlessVoter: false,
  }
  return new MemoryStorage({
    state,
    activation,
    electionDefinition: electionSampleDefinition,
  })
}

export function getSampleMachineConfigProvider(): Provider<MachineConfig> {
  return {
    async get() {
      return {
        appMode: VxMarkPlusVxPrint,
        machineId: '012',
        codeVersion: 'demo',
      }
    },
  }
}

/* istanbul ignore next */
const DemoApp = ({
  card = getSampleCard(),
  storage = getDemoStorage(),
  machineConfig = getSampleMachineConfigProvider(),
  hardware,
  ...rest
}: Props): JSX.Element => {
  const [internalHardware, setInternalHardware] = React.useState(hardware)
  React.useEffect(() => {
    const updateHardware = async () => {
      if (internalHardware === undefined) {
        setInternalHardware(await MemoryHardware.buildDemo())
      }
    }
    void updateHardware()
  }, [internalHardware])
  if (internalHardware === undefined) {
    return <div />
  }
  return (
    <App
      card={card}
      storage={storage}
      machineConfig={machineConfig}
      hardware={internalHardware}
      {...rest}
    />
  )
}

export default DemoApp
