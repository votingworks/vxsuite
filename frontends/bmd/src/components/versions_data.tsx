import React from 'react';
import styled from 'styled-components';
import { Prose, Text } from '@votingworks/ui';
import { MachineConfig } from '../config/types';

const StyledVersions = styled(Prose)`
  margin-top: 1rem;
  border-top: 1px solid #666666;
  padding-top: 0.5rem;
`;

interface Props {
  machineConfig: MachineConfig;
  electionHash: string;
}

export function VersionsData({
  machineConfig: { machineId, codeVersion },
  electionHash,
}: Props): JSX.Element {
  const electionId = electionHash.substring(0, 10);
  return (
    <StyledVersions compact maxWidth={false}>
      <Text small noWrap>
        Election ID: <strong>{electionId}</strong>
      </Text>
      <Text small noWrap>
        Machine ID: <strong>{machineId}</strong>
      </Text>
      <Text small noWrap>
        Software Version: <strong>{codeVersion}</strong>
      </Text>
    </StyledVersions>
  );
}
