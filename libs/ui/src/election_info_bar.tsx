import React from 'react';

import {
  ElectionDefinition,
  getDisplayElectionHash,
  PrecinctSelection,
} from '@votingworks/types';
import { formatShortDate, getPrecinctSelectionName } from '@votingworks/utils';
import styled from 'styled-components';
import { DateTime } from 'luxon';
import { Seal } from './seal';
import { Caption, Font } from './typography';
import { LabelledText } from './labelled_text';

const Bar = styled.div`
  align-content: flex-end;
  align-items: center;
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  padding: 0.25rem 0.25rem;
`;

const ElectionInfoContainer = styled.div`
  align-items: center;
  display: flex;
  gap: 0.25rem;
  justify-content: start;
`;

const SealContainer = styled.div`
  flex-shrink: 0;
  height: 2.25rem;
  width: 2.25rem;
`;

const SystemInfoContainer = styled.div`
  align-content: flex-end;
  display: flex;
  flex-direction: row;
  flex-grow: 1;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: end;
  text-align: right;
`;

export type InfoBarMode = 'voter' | 'pollworker' | 'admin';

export interface ElectionInfoBarProps {
  mode?: InfoBarMode;
  electionDefinition: ElectionDefinition;
  codeVersion?: string;
  machineId?: string;
  precinctSelection?: PrecinctSelection;
}
export function ElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  codeVersion,
  machineId,
  precinctSelection,
}: ElectionInfoBarProps): JSX.Element {
  const {
    election: { precincts, date, title, county, state, seal, sealUrl },
  } = electionDefinition;
  const electionDate = formatShortDate(DateTime.fromISO(date));

  const electionInfoLabel = (
    <React.Fragment>
      {precinctSelection && (
        <React.Fragment>
          <Font noWrap>
            {getPrecinctSelectionName(precincts, precinctSelection)},
          </Font>{' '}
        </React.Fragment>
      )}
      <Font noWrap>{county.name},</Font> <Font noWrap>{state}</Font>
    </React.Fragment>
  );

  const electionInfo = (
    <Caption weight="regular">
      <LabelledText labelPosition="bottom" label={electionInfoLabel}>
        <Font weight="bold">{title}</Font> — <Font noWrap>{electionDate}</Font>
      </LabelledText>
    </Caption>
  );

  const codeVersionInfo =
    mode !== 'voter' && codeVersion ? (
      <Caption noWrap weight="bold">
        <LabelledText label="Software Version">
          <Font weight="bold">{codeVersion}</Font>
        </LabelledText>
      </Caption>
    ) : null;

  const machineIdInfo =
    mode !== 'voter' && machineId ? (
      <Caption noWrap>
        <LabelledText label="Machine ID">
          <Font weight="bold">{machineId}</Font>
        </LabelledText>
      </Caption>
    ) : null;

  const electionIdInfo = (
    <Caption noWrap>
      <LabelledText label="Election ID">
        <Font weight="bold">{getDisplayElectionHash(electionDefinition)}</Font>
      </LabelledText>
    </Caption>
  );

  return (
    <Bar data-testid="electionInfoBar">
      <ElectionInfoContainer>
        <SealContainer>
          {(seal || sealUrl) && <Seal seal={seal} sealUrl={sealUrl} />}
        </SealContainer>
        {electionInfo}
      </ElectionInfoContainer>
      <SystemInfoContainer>
        {codeVersionInfo}
        {machineIdInfo}
        {electionIdInfo}
      </SystemInfoContainer>
    </Bar>
  );
}

const VerticalBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const MachineInfoSection = styled.div`
  display: flex;
  flex-direction: column;
`;

const TinyInfo = styled(Caption)`
  display: block;
  font-size: 0.6rem;
`;

/* istanbul ignore next - purely presentational */
export function VerticalElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  codeVersion,
  machineId,
  precinctSelection,
}: ElectionInfoBarProps): JSX.Element {
  const {
    election: { precincts, date, title, county, state, seal, sealUrl },
  } = electionDefinition;
  const electionDate = formatShortDate(DateTime.fromISO(date));

  return (
    <VerticalBar>
      <Caption weight="regular" align="left">
        <ElectionInfoContainer>
          <SealContainer>
            {(seal || sealUrl) && <Seal seal={seal} sealUrl={sealUrl} />}
          </SealContainer>
          <Font weight="bold">{title}</Font>
        </ElectionInfoContainer>

        {precinctSelection && (
          <TinyInfo>
            {getPrecinctSelectionName(precincts, precinctSelection)}
          </TinyInfo>
        )}

        <TinyInfo>
          {county.name}, {state}
        </TinyInfo>

        <TinyInfo>{electionDate}</TinyInfo>
      </Caption>

      <MachineInfoSection>
        {mode !== 'voter' && codeVersion && (
          <TinyInfo>
            Software Version: <Font weight="semiBold">{codeVersion}</Font>
          </TinyInfo>
        )}

        {mode !== 'voter' && machineId && (
          <TinyInfo>
            Machine ID: <Font weight="semiBold">{machineId}</Font>
          </TinyInfo>
        )}

        <TinyInfo>
          Election ID:{' '}
          <Font weight="semiBold">
            {getDisplayElectionHash(electionDefinition)}
          </Font>
        </TinyInfo>
      </MachineInfoSection>
    </VerticalBar>
  );
}
