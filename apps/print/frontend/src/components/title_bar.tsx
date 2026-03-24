import React from 'react';
import { H1, MainHeader, TestModeBanner } from '@votingworks/ui';
import styled from 'styled-components';
import { getElectionRecord, getTestMode } from '../api';

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
`;

const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 4rem;
  padding: 0.5rem 1rem;
  box-sizing: border-box;
`;

export function TitleBar({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}): JSX.Element {
  const electionRecordQuery = getElectionRecord.useQuery();
  const testModeQuery = getTestMode.useQuery();

  const isTestMode = testModeQuery.data ?? false;
  const isConfigured = electionRecordQuery.data !== null;

  return (
    <React.Fragment>
      {isTestMode && isConfigured && <TestModeBanner />}
      <Header>
        <H1>{title}</H1>
        {actions && <ButtonRow>{actions}</ButtonRow>}
      </Header>
    </React.Fragment>
  );
}
