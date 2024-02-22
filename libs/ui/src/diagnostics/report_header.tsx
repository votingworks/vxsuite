import styled from 'styled-components';
import React from 'react';
import { format } from '@votingworks/utils';
import { LogoMark } from '../logo_mark';
import { P, H1, Font } from '../typography';

const Metadata = styled(P)`
  font-size: 1em;
`;

const MetadataContainer = styled.div`
  display: flex;
  gap: 1em;
  justify-content: start;
`;

export function ReadinessReportHeader({
  machineType,
  generatedAtTime,
  machineId,
}: {
  machineType: string;
  generatedAtTime: Date;
  machineId: string;
}): JSX.Element {
  const generatedAt = format.localeLongDateAndTime(generatedAtTime);

  return (
    <React.Fragment>
      <LogoMark />
      <H1 style={{ marginBottom: '0.1em' }}>
        {machineType} Equipment Readiness Report
      </H1>
      <MetadataContainer>
        <Metadata>
          <Font weight="bold">Machine ID:</Font> {machineId}
        </Metadata>
        <Metadata>
          <Font weight="bold">Date:</Font> {generatedAt}
        </Metadata>
      </MetadataContainer>
    </React.Fragment>
  );
}
