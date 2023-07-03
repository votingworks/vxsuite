import { Logger } from '@votingworks/logging';
import { Printer, ConverterClientType } from '@votingworks/types';
import { Hardware, randomBallotId } from '@votingworks/utils';
import { useUsbDrive, useDevices } from '@votingworks/ui';

import { AppContext } from './contexts/app_context';
import { ElectionManager } from './components/election_manager';
import {
  getAuthStatus,
  getCurrentElectionMetadata,
  getMachineConfig,
} from './api';

export interface Props {
  printer: Printer;
  hardware: Hardware;
  logger: Logger;
  converter?: ConverterClientType;
  generateBallotId?: () => string;
}

export function AppRoot({
  printer,
  hardware,
  converter,
  logger,
  generateBallotId = randomBallotId,
}: Props): JSX.Element | null {
  const { cardReader, printer: printerInfo } = useDevices({ hardware, logger });

  const authStatusQuery = getAuthStatus.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const currentElectionMetadataQuery = getCurrentElectionMetadata.useQuery();

  const electionDefinition =
    currentElectionMetadataQuery.data?.electionDefinition;

  const usbDrive = useUsbDrive({ logger });

  if (
    !authStatusQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !currentElectionMetadataQuery.isSuccess
  ) {
    return null;
  }

  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        configuredAt: currentElectionMetadataQuery.data?.createdAt,
        converter,
        isOfficialResults:
          currentElectionMetadataQuery.data?.isOfficialResults ?? false,
        printer,
        usbDrive,
        generateBallotId,
        auth: authStatusQuery.data,
        machineConfig: getMachineConfigQuery.data,
        hasCardReaderAttached: !!cardReader,
        hasPrinterAttached: !!printerInfo,
        logger,
      }}
    >
      <ElectionManager />
    </AppContext.Provider>
  );
}
