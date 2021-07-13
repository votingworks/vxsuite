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
import { MachineConfig, VxMarkPlusVxPrint } from './config/types'

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
  return new MemoryStorage({
    state: {
      electionDefinition: electionSampleDefinition,
      appPrecinctId,
      ballotsPrintedCount: 0,
      isLiveMode: true,
      isPollsOpen: true,
      ballotStyleId,
      isCardlessVoter: false,
      precinctId,
    },
    electionDefinition: electionSampleDefinition,
    activation: {
      ballotStyleId,
      isCardlessVoter: false,
      precinctId,
    },
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
const DemoApp: React.FC<Props> = ({
  card = getSampleCard(),
  storage = getDemoStorage(),
  machineConfig = getSampleMachineConfigProvider(),
  hardware,
  ...rest
}) => {
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
