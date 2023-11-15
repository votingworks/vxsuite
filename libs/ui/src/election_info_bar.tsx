import React from 'react';

import {
  ElectionDefinition,
  getDisplayElectionHash,
  PrecinctSelection,
} from '@votingworks/types';
import styled from 'styled-components';
import { Seal } from './seal';
import { Caption, Font } from './typography';
import { LabelledText } from './labelled_text';
import { electionStrings, PrecinctSelectionName } from './ui_strings';

const Bar = styled.div`
  align-content: flex-end;
  align-items: center;
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.onBackground};
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
  padding: 0.25rem;
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
  flex-flow: row wrap;
  flex-grow: 1;
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
    election,
    election: { precincts, county, seal },
  } = electionDefinition;

  const electionInfoLabel = (
    <React.Fragment>
      {precinctSelection && (
        <React.Fragment>
          <Font noWrap>
            <PrecinctSelectionName
              electionPrecincts={precincts}
              precinctSelection={precinctSelection}
            />
            ,
          </Font>{' '}
        </React.Fragment>
      )}
      <Font noWrap>{electionStrings.countyName(county)},</Font>{' '}
      <Font noWrap>{electionStrings.stateName(election)}</Font>
    </React.Fragment>
  );

  const electionInfo = (
    <Caption weight="regular">
      <LabelledText labelPosition="bottom" label={electionInfoLabel}>
        <Font weight="bold">{electionStrings.electionTitle(election)}</Font> —{' '}
        <Font noWrap>{electionStrings.electionDate(election)}</Font>
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
          <Seal seal={seal} />
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
    election,
    election: { precincts, county, seal },
  } = electionDefinition;

  return (
    <VerticalBar>
      <Caption weight="regular" align="left">
        <ElectionInfoContainer>
          <SealContainer>
            <Seal seal={seal} />
          </SealContainer>
          <Font weight="bold">{electionStrings.electionTitle(election)}</Font>
        </ElectionInfoContainer>

        {precinctSelection && (
          <TinyInfo>
            <PrecinctSelectionName
              electionPrecincts={precincts}
              precinctSelection={precinctSelection}
            />
          </TinyInfo>
        )}

        <TinyInfo>
          {electionStrings.countyName(county)},{' '}
          {electionStrings.stateName(election)}
        </TinyInfo>

        <TinyInfo>{electionStrings.electionDate(election)}</TinyInfo>
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
