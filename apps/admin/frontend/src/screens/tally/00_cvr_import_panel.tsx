/* istanbul ignore file */

import React from 'react';
import styled from 'styled-components';

import {
  Button,
  Callout,
  Caption,
  Font,
  FullScreenIconWrapper,
  H3,
  Icons,
  P,
  StyledButtonProps,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';

import {
  format,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import type { CastVoteRecordFileMetadata } from '@votingworks/admin-backend';
import { DateTime } from 'luxon';
import { Id } from '@votingworks/types';
import { AppContext } from '../../contexts/app_context';
import * as api from '../../api';
import { TIME_FORMAT } from '../../config/globals';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { useCvrMode, usePollingPlaces } from './00_hooks';

export interface Props {
  className?: string;
  onClose: () => void;
}

const Container = styled.div`
  display: grid;
  grid-template-rows: 1fr min-content;
  gap: var(--grid-gap);
  position: relative;
  height: 100%;
  overflow-x: visible;
  overflow-y: hidden;
`;

const Body = styled.div`
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: min-content 1fr;
  gap: var(--grid-gap);
  outline-offset: -${(p) => p.theme.sizes.bordersRem.medium}rem;
  padding-right: 0.25rem;
  position: relative;
  height: 100%;
  overflow: auto;
`;

const Footer = styled.footer`
  display: flex;
  justify-content: end;
  gap: var(--grid-gap);
  position: relative;
  height: 100%;
  overflow-x: visible;
  overflow-y: hidden;
`;

const Spinner = styled(FullScreenIconWrapper)`
  align-items: center;
  justify-content: center;
  height: 100%;
  display: grid;
  width: 100%;
`;

export function CvrImportPanel(props: Props): React.ReactNode {
  const { className, onClose } = props;

  const [fileLoading, setFileLoading] = React.useState<
    CastVoteRecordFileMetadata | undefined
  >(undefined);

  const { usbDriveStatus, electionDefinition, auth } =
    React.useContext(AppContext);

  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));

  const importedFiles = api.getCastVoteRecordFiles.useQuery().data;
  const mode = api.getCastVoteRecordFileMode.useQuery().data;
  const availableFiles = api.listCastVoteRecordFilesOnUsb.useQuery().data;

  const addFile = api.addCastVoteRecordFile.useMutation();

  const loading = !mode || !importedFiles || !availableFiles;

  let title = 'Load CVRs';
  switch (mode) {
    case 'unlocked':
      title = 'Load CVRs';
      break;

    case 'official':
      title = 'Load Official Ballot CVRs';
      break;

    case 'test':
      title = 'Load Test Ballot CVRs';
      break;

    case undefined:
      title = 'Load CVRs';
      break;

    default:
      throwIllegalValue(mode);
  }

  const usbPresent = usbDriveStatus.status === 'mounted';
  const disabled = !usbPresent || addFile.isLoading;

  async function startImport(meta: CastVoteRecordFileMetadata) {
    setFileLoading(meta);
    void (await addFile.mutateAsync(meta));
    setFileLoading(undefined);
  }

  const content: React.ReactNode = (() => {
    if (loading) {
      return (
        <Spinner align="center">
          <Icons.Loading />
        </Spinner>
      );
    }

    if (!usbPresent) return <NoUsb />;

    return (
      <Content
        disabled={disabled}
        loading={fileLoading}
        startImport={startImport}
      />
    );
  })();

  return (
    <Container className={className}>
      <Body>
        <H3 style={{ fontWeight: 700, margin: 0 }}>{title}</H3>
        {content}
      </Body>

      {false && <ImportCvrFilesModal onClose={onClose} />}

      <Footer>
        <Button
          disabled={disabled}
          fill="outlined"
          icon="Done"
          onPress={onClose}
          variant="primary"
        >
          Done
        </Button>
      </Footer>
    </Container>
  );
}

const Exports = styled.div`
  display: grid;
  gap: var(--grid-gap);
`;

const ContentBody = styled.div`
  display: grid;
  gap: var(--grid-gap);
`;

function Content(props: {
  disabled?: boolean;
  loading?: CastVoteRecordFileMetadata;
  startImport(meta: CastVoteRecordFileMetadata): void;
}): React.ReactNode {
  const { disabled, loading, startImport } = props;

  const pollingPlaces = usePollingPlaces();
  const mode = useCvrMode();

  const locationNames = React.useMemo(() => {
    const names = new Map<Id, string>();

    for (const p of pollingPlaces) {
      names.set(p.id, p.name);
    }

    return names;
  }, [pollingPlaces]);

  const availableFiles = api.listCastVoteRecordFilesOnUsb.useQuery().data;

  const sortedFiles = React.useMemo(() => {
    if (!availableFiles) return null;

    return [...availableFiles].sort((a, b) => {
      if (!a.pollingPlaceIds) return -1;
      if (!b.pollingPlaceIds) return 1;

      const nameA = locationName(locationNames, a);
      const nameB = locationName(locationNames, b);
      if (!nameA || !nameB) return 0;

      if (nameA === nameB) {
        return a.exportTimestamp.valueOf() - b.exportTimestamp.valueOf();
      }

      return nameA.localeCompare(nameB, undefined, {
        ignorePunctuation: true,
        numeric: true,
      });
    });
  }, [availableFiles, locationNames]);

  if (!sortedFiles) return null;

  const testMode = mode === 'test';

  function shouldInclude(f: CastVoteRecordFileMetadata) {
    if (mode === 'unlocked') return true;
    return testMode === f.isTestModeResults;
  }

  return (
    <div>
      <P>The following exports were found on the USB drive:</P>
      <ContentBody>
        <Exports>
          {sortedFiles.map(
            (f) =>
              shouldInclude(f) && (
                <Export
                  disabled={disabled}
                  loading={loading === f}
                  key={f.name}
                  meta={f}
                  startImport={startImport}
                />
              )
          )}
        </Exports>
      </ContentBody>
    </div>
  );
}

function locationName(
  names: Map<Id, string>,
  meta: CastVoteRecordFileMetadata
) {
  if (!meta.pollingPlaceIds) return names.get('central-scanning');

  return names.get(meta.pollingPlaceIds[0]);
}

const ExportDetails = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  padding-right: 0.25rem;
`;

const ColorText = styled(Font)<{ color: 'primary' | 'warningAccent' }>`
  color: ${(p) => p.theme.colors[p.color]};
`;

const DateString = styled(Font)`
  color: #333;
`;

const BORDER_COLOR = '#ddd';

const IconSection = styled.div`
  align-items: center;
  border-right: 1px solid ${BORDER_COLOR};
  display: grid;
  font-size: 1.25rem;
  gap: 0.25rem;
  grid-template-rows: min-content min-content;
  height: 100%;
  justify-content: center;
  justify-items: center;
  padding: 1rem;
  width: 4.25rem;
`;

const TotalSection = styled.div`
  align-items: end;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0.5rem 1rem;
  white-space: nowrap;
`;

const TotalNumber = styled.div`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  line-height: 1.2;
`;

const ContentSection = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 0.5rem;
`;

const Title = styled.div`
  color: ${(p) => p.theme.colors.onBackground};
`;

const CardContainer = styled.button<
  { imported: boolean; usingShadedBg?: boolean } & StyledButtonProps
>`
  padding: 0;
  background-color: ${(p) => p.theme.colors.background};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: 1px solid ${BORDER_COLOR};
  cursor: pointer;
  display: grid;
  grid-template-columns: min-content 1fr min-content;
  outline-offset: -${(p) => p.theme.sizes.bordersRem.medium}rem;
  overflow: hidden;
  text-align: left;
  transition: all 100ms ease-out;
  width: 100%;

  ${IconSection} {
    background-color: ${(p) =>
      p.usingShadedBg ? p.theme.colors.background : '#f7f7f7'};
  }

  :hover {
    background-color: ${(p) => p.theme.colors.primaryContainer};

    ${IconSection} {
      color: ${(p) => p.theme.colors.primary};
    }
  }

  :disabled {
    background-color: ${(p) => p.theme.colors.containerLow};
    color: #666;
    cursor: not-allowed;

    ${ColorText},
    ${DateString},
    ${IconSection},
    ${Title},
    ${TotalNumber} {
      color: #666;
    }
  }
`;

function Export(props: {
  disabled?: boolean;
  loading?: boolean;
  meta: CastVoteRecordFileMetadata;
  startImport(meta: CastVoteRecordFileMetadata): void;
}): React.ReactNode {
  const { disabled, loading, meta, startImport } = props;

  const allLocations = usePollingPlaces();

  const locationNames = React.useMemo(() => {
    const includedPlaceIds = meta.pollingPlaceIds || [];

    const names: string[] = [];
    for (const p of allLocations) {
      if (!includedPlaceIds.includes(p.id)) continue;
      names.push(p.name);
    }

    return names;
  }, [allLocations, meta.pollingPlaceIds]);

  const availableFiles = api.listCastVoteRecordFilesOnUsb.useQuery().data;
  const importedFiles = api.getCastVoteRecordFiles.useQuery().data;
  const mode = api.getCastVoteRecordFileMode.useQuery().data;

  const imported = React.useMemo(() => {
    if (!importedFiles) return false;
    for (const f of importedFiles) {
      if (f.filename !== meta.name) continue;
      if (f.exportTimestamp !== meta.exportTimestamp.toISOString()) continue;
      return true;
    }

    return false;
  }, [importedFiles, meta]);

  if (!availableFiles || !importedFiles || !mode) return null;

  function onPress() {
    startImport(meta);
  }

  return (
    <CardContainer
      disabled={disabled || imported}
      imported={imported}
      onClick={onPress}
      role={imported ? undefined : 'button'}
    >
      <IconSection>
        {loading ? (
          <Icons.Loading />
        ) : imported ? (
          <Icons.Done />
        ) : (
          <Icons.Import color="primary" />
        )}
        <Caption style={{ fontSize: '0.6rem' }} weight="semiBold">
          {loading ? 'Loading' : imported ? 'Loaded' : 'Load'}
        </Caption>
      </IconSection>

      <ContentSection>
        <ExportDetails>
          <Caption>
            <ColorText
              color={meta.isTestModeResults ? 'warningAccent' : 'primary'}
              weight="bold"
            >
              {meta.isTestModeResults ? 'TEST' : 'OFFICIAL'}
            </ColorText>{' '}
            &bull;{' '}
            <DateString>
              {DateTime.fromJSDate(meta.exportTimestamp).toFormat(TIME_FORMAT)}
            </DateString>
          </Caption>

          <Font>{locationNames.join(', ')}</Font>

          {meta.scannerIds.length === 1 && (
            <Caption>Scanner {meta.scannerIds[0]}</Caption>
          )}
          {meta.scannerIds.length > 1 && (
            <Caption>Scanners: {meta.scannerIds.join(', ')}</Caption>
          )}
        </ExportDetails>
      </ContentSection>

      <TotalSection>
        <TotalNumber>{format.count(meta.cvrCount)}</TotalNumber>
      </TotalSection>
    </CardContainer>
  );
}

function NoUsb(): React.ReactNode {
  return (
    <div>
      <Callout color="warning" style={{ maxWidth: 'max-content' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <P weight="bold">
            <Icons.Warning color="warning" /> No USB Drive Detected
          </P>
          <P>Insert a USB drive in order to load CVRs from a scanner.</P>
        </div>
      </Callout>
    </div>
  );
}
