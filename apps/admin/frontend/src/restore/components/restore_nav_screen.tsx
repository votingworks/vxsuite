import type React from 'react';
import styled from 'styled-components';
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
import { getAuthStatus, getMachineConfig, logOut } from '../api.js';
import { ScreenWithBanner } from './restore_mode_banner.js';

const Body = styled.div`
  display: flex;
`;

export function RestoreNavScreen({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  const authStatusQuery = getAuthStatus.usePollingQuery();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const logOutMutation = logOut.useMutation();
  const machineConfigQuery = getMachineConfig.useQuery();

  return (
    <ScreenWithBanner>
      <Body>
        <LeftNav style={{ width: '11rem' }}>
          <AppLogo appName="VxAdmin" />
          <div style={{ marginTop: 'auto' }}>
            <VerticalElectionInfoBar
              mode="admin"
              codeVersion={machineConfigQuery.data?.codeVersion}
              machineId={machineConfigQuery.data?.machineId}
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
