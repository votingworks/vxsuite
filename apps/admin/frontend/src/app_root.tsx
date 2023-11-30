import { Logger } from '@votingworks/logging';
import { Printer, ConverterClientType } from '@votingworks/types';
import { Hardware, randomBallotId } from '@votingworks/utils';
import { useDevices } from '@votingworks/ui';

import { AppContext } from './contexts/app_context';
import { AppRoutes } from './components/app_routes';
import {
  getAuthStatus,
  getCurrentElectionMetadata,
  getMachineConfig,
  getUsbDriveStatus,
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
  const { printer: printerInfo } = useDevices({ hardware, logger });

  const authStatusQuery = getAuthStatus.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const currentElectionMetadataQuery = getCurrentElectionMetadata.useQuery();

  const electionDefinition =
    currentElectionMetadataQuery.data?.electionDefinition;

  if (
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !currentElectionMetadataQuery.isSuccess
  ) {
    return null;
  }

  const hasCardReaderAttached =
    !authStatusQuery.data ||
    !(
      authStatusQuery.data.status === 'logged_out' &&
      authStatusQuery.data.reason === 'no_card_reader'
    );
  const usbDriveStatus = usbDriveStatusQuery.data;

  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        configuredAt: currentElectionMetadataQuery.data?.createdAt,
        converter,
        isOfficialResults:
          currentElectionMetadataQuery.data?.isOfficialResults ?? false,
        printer,
        usbDriveStatus,
        generateBallotId,
        auth: authStatusQuery.data,
        machineConfig: getMachineConfigQuery.data,
        hasCardReaderAttached,
        hasPrinterAttached: !!printerInfo,
        logger,
      }}
    >
      <AppRoutes />
    </AppContext.Provider>
  );
}
