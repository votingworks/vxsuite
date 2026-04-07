import {
  ElectionDefinition,
  formatElectionHashes,
  PrecinctSelection,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import styled from 'styled-components';
import { assertDefined } from '@votingworks/basics';
import { Seal } from './seal';
import { Caption, Font } from './typography';
import { LabelledText } from './labelled_text';
import {
  electionStrings,
  PollingPlaceName,
  PrecinctSelectionName,
} from './ui_strings';

export const InfoBar = styled.div`
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
  gap: 0.5rem;
  justify-content: start;
`;

const SystemInfoContainer = styled.div`
  align-content: flex-end;
  flex: 1;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.75rem;
  justify-content: flex-end;
`;

export type InfoBarMode = 'voter' | 'pollworker' | 'admin';

interface ElectionInfoProps {
  electionDefinition: ElectionDefinition;
  pollingPlaceId?: string;
  precinctSelection?: PrecinctSelection;
  inverse?: boolean;
}

export function ElectionInfo({
  electionDefinition,
  pollingPlaceId,
  precinctSelection,
  inverse,
}: ElectionInfoProps): JSX.Element {
  const {
    election,
    election: { precincts, county, seal },
  } = electionDefinition;

  const usePollingPlaces = pollingPlacesEnabled();
  const locationName = usePollingPlaces ? (
    <PollingPlaceName election={election} id={pollingPlaceId} />
  ) : (
    <PrecinctSelectionName
      electionPrecincts={precincts}
      precinctSelection={precinctSelection}
    />
  );
  const hasLocation = usePollingPlaces ? !!pollingPlaceId : !!precinctSelection;

  const separator = ', ';
  const electionInfoLabel = (
    <Font maxLines={2}>
      {hasLocation && locationName}
      {hasLocation && separator}
      {electionStrings.countyName(county)}
      {separator}
      {electionStrings.stateName(election)}
    </Font>
  );

  return (
    <ElectionInfoContainer>
      <Seal seal={seal} maxWidth="2.25rem" inverse={inverse} />
      <Caption weight="regular">
        <LabelledText labelPosition="bottom" label={electionInfoLabel}>
          <Font weight="bold">{electionStrings.electionTitle(election)}</Font> —{' '}
          <Font noWrap>{electionStrings.electionDate(election)}</Font>
        </LabelledText>
      </Caption>
    </ElectionInfoContainer>
  );
}

interface SystemInfoProps {
  mode?: InfoBarMode;
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  codeVersion?: string;
  machineId?: string;
}

export function SystemInfo({
  mode = 'voter',
  electionDefinition,
  electionPackageHash,
  codeVersion,
  machineId,
}: SystemInfoProps): JSX.Element {
  const codeVersionInfo =
    mode !== 'voter' && codeVersion ? (
      <Caption noWrap>
        <LabelledText label="Version">
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

  const electionIdInfo = electionDefinition ? (
    <Caption>
      <LabelledText label="Election ID">
        <Font weight="bold">
          {formatElectionHashes(
            electionDefinition.ballotHash,
            assertDefined(electionPackageHash)
          )}
        </Font>
      </LabelledText>
    </Caption>
  ) : null;

  return (
    <SystemInfoContainer>
      {codeVersionInfo}
      {machineIdInfo}
      {electionIdInfo}
    </SystemInfoContainer>
  );
}

export interface ElectionInfoBarProps {
  mode?: InfoBarMode;
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  codeVersion?: string;
  machineId?: string;
  precinctSelection?: PrecinctSelection;
  pollingPlaceId?: string;
}

export function ElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  electionPackageHash,
  codeVersion,
  machineId,
  precinctSelection,
  pollingPlaceId,
}: ElectionInfoBarProps): JSX.Element {
  return (
    <InfoBar data-testid="electionInfoBar">
      {electionDefinition && (
        <ElectionInfo
          electionDefinition={electionDefinition}
          precinctSelection={precinctSelection}
          pollingPlaceId={pollingPlaceId}
        />
      )}
      <SystemInfo
        mode={mode}
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={codeVersion}
        machineId={machineId}
      />
    </InfoBar>
  );
}

const VerticalBar = styled.div<{ inverse?: boolean }>`
  background: ${(p) => p.inverse && p.theme.colors.inverseBackground};
  color: ${(p) => p.inverse && p.theme.colors.onInverse};
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export function VerticalElectionInfoBar({
  mode = 'voter',
  electionDefinition,
  electionPackageHash,
  codeVersion,
  machineId,
  precinctSelection,
  pollingPlaceId,
  inverse,
}: ElectionInfoBarProps & { inverse?: boolean }): JSX.Element {
  if (!electionDefinition) {
    return (
      <VerticalBar inverse={inverse}>
        <Caption>
          {mode !== 'voter' && codeVersion && (
            <div>
              Version: <Font weight="semiBold">{codeVersion}</Font>
            </div>
          )}

          {mode !== 'voter' && machineId && (
            <div>
              Machine ID: <Font weight="semiBold">{machineId}</Font>
            </div>
          )}
        </Caption>
      </VerticalBar>
    );
  }
  const {
    election,
    election: { precincts, county, seal },
  } = electionDefinition;

  const usePollingPlaces = pollingPlacesEnabled();
  const hasLocation = usePollingPlaces ? !!pollingPlaceId : !!precinctSelection;
  const locationName = usePollingPlaces ? (
    <div>
      Polling Place:{' '}
      <Font weight="semiBold">
        <PollingPlaceName election={election} id={pollingPlaceId} />
      </Font>
    </div>
  ) : (
    <div>
      Precinct:{' '}
      <Font weight="semiBold">
        <PrecinctSelectionName
          electionPrecincts={precincts}
          precinctSelection={precinctSelection}
        />
      </Font>
    </div>
  );

  return (
    <VerticalBar inverse={inverse}>
      <ElectionInfoContainer>
        <Seal seal={seal} maxWidth="3rem" inverse={inverse} />

        <Caption weight="regular" align="left">
          <Font weight="bold" maxLines={4}>
            {electionStrings.electionTitle(election)}
          </Font>

          <div>
            <Font maxLines={4}>
              {electionStrings.countyName(county)},{' '}
              {electionStrings.stateName(election)}
            </Font>
          </div>

          <div>{electionStrings.electionDate(election)}</div>
        </Caption>
      </ElectionInfoContainer>

      <Caption>
        {mode !== 'voter' && codeVersion && (
          <div>
            Version: <Font weight="semiBold">{codeVersion}</Font>
          </div>
        )}

        {mode !== 'voter' && machineId && (
          <div>
            Machine ID: <Font weight="semiBold">{machineId}</Font>
          </div>
        )}

        <div>
          Election ID:{' '}
          <Font weight="semiBold">
            {formatElectionHashes(
              electionDefinition.ballotHash,
              assertDefined(electionPackageHash)
            )}
          </Font>
        </div>

        {hasLocation && locationName}
      </Caption>
    </VerticalBar>
  );
}

function pollingPlacesEnabled() {
  const { ENABLE_POLLING_PLACES } = BooleanEnvironmentVariableName;
  return isFeatureFlagEnabled(ENABLE_POLLING_PLACES);
}
