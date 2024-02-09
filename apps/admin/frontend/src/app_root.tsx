import { Logger } from '@votingworks/logging';
import { Printer, ConverterClientType } from '@votingworks/types';
import { randomBallotId } from '@votingworks/utils';

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
  logger: Logger;
  converter?: ConverterClientType;
  generateBallotId?: () => string;
}

export function AppRoot({
  printer,
  converter,
  logger,
  generateBallotId = randomBallotId,
}: Props): JSX.Element | null {
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

  const hasCardReaderAttached = !(
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
        logger,
      }}
    >
      <AppRoutes />
    </AppContext.Provider>
  );
}
