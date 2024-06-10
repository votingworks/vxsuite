import styled from 'styled-components';
import React from 'react';
import { format } from '@votingworks/utils';
import { LogoMark } from '../logo_mark';
import { P, H1, Font } from '../typography';

export interface ReadinessReportHeaderMetadata {
  label: string;
  value: string;
}

export interface ReadinessReportHeaderProps {
  generatedAtTime: Date;
  machineId?: string;
  additionalMetadata?: ReadinessReportHeaderMetadata[];
  reportType: string;
}

const MetadataLine = styled(P)`
  font-size: 1em;
`;

const MetadataContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  column-gap: 1em;
  justify-content: start;
`;

function Metadata(props: ReadinessReportHeaderMetadata) {
  const { label, value } = props;

  return (
    <MetadataLine>
      <Font weight="bold">{label}:</Font> {value}
    </MetadataLine>
  );
}

export function ReadinessReportHeader({
  reportType,
  generatedAtTime,
  machineId,
  additionalMetadata = [],
}: ReadinessReportHeaderProps): JSX.Element {
  const generatedAt = format.localeLongDateAndTime(generatedAtTime);

  return (
    <React.Fragment>
      <LogoMark />
      <H1 style={{ marginBottom: '0.1em' }}>{reportType} Readiness Report</H1>
      <MetadataContainer>
        {machineId && <Metadata label="Machine ID" value={machineId} />}
        <Metadata label="Date" value={generatedAt} />
        {additionalMetadata.map((metadata) => (
          <Metadata {...metadata} key={metadata.label} />
        ))}
      </MetadataContainer>
    </React.Fragment>
  );
}
