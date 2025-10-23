import { H1, UsbControllerButton, Button, MainHeader } from '@votingworks/ui';
import {
  isSystemAdministratorAuth,
  isElectionManagerAuth,
} from '@votingworks/utils';
import styled from 'styled-components';
import { getAuthStatus } from '../api';

export const ButtonRow = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
`;

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  height: 4rem;
`;

export function TopBar({ title }: { title: string }): JSX.Element | null {
  const authQuery = getAuthStatus.useQuery();
  let showButtonRow = false;
  if (authQuery.isSuccess) {
    showButtonRow =
      isSystemAdministratorAuth(authQuery.data) ||
      isElectionManagerAuth(authQuery.data);
  }
  return (
    <Header>
      <div>{title && <H1>{title}</H1>}</div>
      {showButtonRow && (
        <ButtonRow>
          <UsbControllerButton
            usbDriveEject={() => console.log('TODO: Eject USB Drive')}
            usbDriveStatus={{ status: 'no_drive' }}
            usbDriveIsEjecting={false}
          />
          <Button onPress={() => console.log('TODO: Lock Machine')} icon="Lock">
            Lock Machine
          </Button>
          {/* <BatteryDisplay /> */}
        </ButtonRow>
      )}
    </Header>
  );
}
