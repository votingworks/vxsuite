import type React from 'react';
import styled from 'styled-components';
import type { MachineConfig } from '@votingworks/admin-backend';
import {
  AppLogo,
  BatteryStatus,
  DateTimeDisplay,
  H1,
  LeftNav,
  LockMachineButton,
  Main,
  MainContent,
  SessionTimeLimitTimer,
  Toolbar,
  ToolbarButtons,
  VerticalElectionInfoBar,
} from '@votingworks/ui';
import { Header } from '../../components/navigation_screen.js';
import { systemCallApi } from '../../shared_api.js';
import { getAuthStatus, logOut } from '../api.js';
import { ScreenWithBanner } from './restore_mode_banner.js';

const Body = styled.div`
  display: flex;
`;

export function RestoreNavScreen({
  title,
  machineConfig,
  children,
}: {
  title: string;
  machineConfig: MachineConfig;
  children: React.ReactNode;
}): JSX.Element {
  const authStatusQuery = getAuthStatus.usePollingQuery();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const logOutMutation = logOut.useMutation();

  return (
    <ScreenWithBanner>
      <Body>
        <LeftNav style={{ width: '11rem' }}>
          <AppLogo appName="VxAdmin" />
          <div style={{ marginTop: 'auto' }}>
            <VerticalElectionInfoBar
              mode="admin"
              codeVersion={machineConfig.codeVersion}
              machineId={machineConfig.machineId}
              inverse
            />
          </div>
        </LeftNav>
        <Main flexColumn>
          <Toolbar>
            {batteryInfoQuery.isSuccess && batteryInfoQuery.data && (
              <BatteryStatus batteryInfo={batteryInfoQuery.data} />
            )}
            <DateTimeDisplay />
            <ToolbarButtons>
              <LockMachineButton onLock={() => logOutMutation.mutate()} />
            </ToolbarButtons>
          </Toolbar>
          <SessionTimeLimitTimer authStatus={authStatusQuery.data} />
          <Header>
            <div>
              <H1>{title}</H1>
            </div>
          </Header>
          <MainContent>{children}</MainContent>
        </Main>
      </Body>
    </ScreenWithBanner>
  );
}
