import React from 'react';
import styled from 'styled-components';
import { DateTime } from 'luxon';

import {
  Modal,
  ModalWidth,
  Table,
  TD,
  Button,
  P,
  Font,
  Icons,
  H3,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';

import { Loading } from '../../components/loading';
import { NODE_ENV, TIME_FORMAT } from '../../config/globals';
import { useCvrImporter } from './cvr_importer';

const CvrFileTableWrapper = styled.div`
  background: ${(p) => p.theme.colors.containerLow};
  position: relative;

  /* Ensure that the last row is cut in half so it's clear you can scroll */
  max-height: 22rem;
  overflow-y: auto;

  table {
    border-collapse: separate;
    border-spacing: 0;

    thead tr {
      position: sticky;
      top: -1px; /* Cover up small gap */
      z-index: 1;
      background: ${(p) => p.theme.colors.containerHigh};
    }
  }
`;

const LabelText = styled.span`
  vertical-align: middle;
  text-transform: uppercase;
`;

const Content = styled.div`
  overflow: hidden;
`;

export interface Props {
  onClose: () => void;
}

export function ImportCvrFilesModal({ onClose }: Props): JSX.Element | null {
  const importer = useCvrImporter();

  if (importer.state === 'loading') {
    return (
      <Modal
        centerContent={false}
        content={
          <H3 align="center">
            <Icons.Loading /> Loading
          </H3>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Cancel</Button>}
      />
    );
  }

  if (importer.state === 'error') {
    return (
      <Modal
        title="Error"
        content={
          <P>
            There was an error reading the contents of{' '}
            <Font weight="bold">{importer.filename}</Font>:{' '}
            {importer.errorMessage}
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (importer.state === 'duplicate') {
    return (
      <Modal
        title="Duplicate Export"
        content={
          <P>
            The selected export was ignored as a duplicate of a previously
            loaded export.
          </P>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (importer.state === 'success') {
    const { alreadyPresent, newlyAdded } = importer.result;
    const total = alreadyPresent + newlyAdded;
    const content = (() => {
      if (alreadyPresent > 0) {
        if (total === 1) {
          return <P>The 1 CVR in the selected export was previously loaded.</P>;
        }
        return (
          <P>
            {format.count(alreadyPresent)} of the {format.count(total)} total
            CVRs in the selected export {alreadyPresent === 1 ? 'was' : 'were'}{' '}
            previously loaded.
          </P>
        );
      }
      return <P>The CVRs in the selected export were successfully loaded.</P>;
    })();
    return (
      <Modal
        title={
          newlyAdded === 1
            ? '1 New CVR Loaded'
            : `${format.count(newlyAdded)} New CVRs Loaded`
        }
        content={content}
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (importer.state === 'importing') {
    return <Modal content={<Loading>Loading CVRs</Loading>} />;
  }

  if (importer.state === 'noUsb') {
    return (
      <Modal
        title="No USB Drive Detected"
        content={
          <P>Insert a USB drive in order to load CVRs from a scanner.</P>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            {NODE_ENV === 'development' && importer.manualImportButton}
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
      />
    );
  }

  const fileMode = importer.existingImports.mode;

  // Determine if we are already locked to a filemode based on previously loaded CVRs
  const fileModeLocked = fileMode !== 'unlocked';

  // Parse the file options on the USB drive and build table rows for each valid file.
  const fileTableRows: JSX.Element[] = [];
  let numberOfNewFiles = 0;
  const importedCvrFiles = importer.existingImports.imports;
  for (const file of importer.usbExports) {
    const { isTestModeResults, scannerIds, exportTimestamp, cvrCount, name } =
      file;
    // To tell if a CVR export was already imported, we need to check its name
    // and export timestamp, since a VxScan continuous CVR export will reuse
    // the same export directory as CVRs are added, updating the export
    // timestamp each time. So if you want to re-import a continuous export
    // later after more CVRs have been added, you should be able to.
    const isFileAlreadyImported = importedCvrFiles.some(
      (importedCvrFile) =>
        importedCvrFile.filename === name &&
        importedCvrFile.exportTimestamp === exportTimestamp.toISOString()
    );
    const inProperFileMode =
      !fileModeLocked ||
      (isTestModeResults && fileMode === 'test') ||
      (!isTestModeResults && fileMode === 'official');
    const canImport = !isFileAlreadyImported && inProperFileMode;
    const row = (
      <tr key={name} data-testid="table-row">
        <td>{DateTime.fromJSDate(exportTimestamp).toFormat(TIME_FORMAT)}</td>
        <td>{scannerIds.join(', ')}</td>
        <td data-testid="cvr-count">{format.count(cvrCount)}</td>
        {!fileModeLocked && (
          <td>
            {isTestModeResults ? (
              <LabelText>
                <Icons.Warning color="warning" /> Test
              </LabelText>
            ) : (
              <LabelText>Official</LabelText>
            )}
          </td>
        )}
        <TD textAlign="right">
          <Button
            onPress={importer.import}
            value={{ path: file.path }}
            disabled={!canImport}
            variant="primary"
          >
            {canImport ? 'Load' : 'Loaded'}
          </Button>
        </TD>
      </tr>
    );
    if (inProperFileMode) {
      fileTableRows.push(row);
      if (canImport) {
        numberOfNewFiles += 1;
      }
    }
  }
  // Set the header and instructional text for the modal
  const headerModeText =
    fileMode === 'test'
      ? 'Test Ballot'
      : fileMode === 'official'
      ? 'Official Ballot'
      : '';

  let instructionalText: JSX.Element | string;
  if (numberOfNewFiles === 0) {
    instructionalText = fileModeLocked ? (
      <React.Fragment>
        No new {headerModeText.toLowerCase()} CVR exports were automatically
        found on the USB drive.
      </React.Fragment>
    ) : (
      <React.Fragment>
        No new CVR exports were automatically found on the USB drive.
      </React.Fragment>
    );
  } else if (fileModeLocked) {
    instructionalText = (
      <React.Fragment>
        The following {headerModeText.toLowerCase()} CVR exports were
        automatically found on the USB drive:
      </React.Fragment>
    );
  } else {
    instructionalText = (
      <React.Fragment>
        The following CVR exports were automatically found on the USB drive:
      </React.Fragment>
    );
  }

  return (
    <Modal
      modalWidth={ModalWidth.Wide}
      title={`Load ${headerModeText} CVRs`}
      content={
        <Content>
          <P>{instructionalText}</P>
          {fileTableRows.length > 0 && (
            <CvrFileTableWrapper>
              <Table>
                <thead>
                  <tr>
                    <th>Saved At</th>
                    <th>Scanner ID</th>
                    <th>CVR Count</th>
                    {!fileModeLocked && <th>Ballot Type</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>{fileTableRows}</tbody>
              </Table>
            </CvrFileTableWrapper>
          )}
        </Content>
      }
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          {importer.manualImportButton}
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
