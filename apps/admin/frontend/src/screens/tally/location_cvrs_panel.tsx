import React from 'react';
import styled, { css } from 'styled-components';

import {
  Button,
  Callout,
  Caption,
  DesktopPalette,
  Font,
  Icons,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Id, PollingPlaceType, pollingPlaceTypeName } from '@votingworks/types';
import type { CastVoteRecordFileRecord } from '@votingworks/admin-backend';
import { GAP, INSET_FOCUS_OUTLINE } from './styles.js';

export interface LocationCvrsPanelProps {
  closePanel: () => void;
  deleteImport?: (id: Id) => void;
  imports: LocationCvrImport[];
  name: string;
  type: PollingPlaceType;
}

export type LocationCvrImport = Pick<
  CastVoteRecordFileRecord,
  | 'id'
  | 'exportTimestamp'
  | 'filename'
  | 'numCvrsImported'
  | 'scannerIds'
  | 'source'
>;

const CalloutContent = styled(Caption)`
  align-items: start;
  display: grid;
  gap: ${GAP};
  grid-template-rows: min-content 1fr;
`;

const Container = styled.div`
  height: 100%;
  min-width: 0;
  overflow: hidden;
`;

/* @coverage-exclude: @starting-style rule is incompatible with our
   current jsdom version. */
const CONTENT_STARTING_STYLE =
  process.env.NODE_ENV !== 'test' &&
  css`
    /* stylelint-disable-next-line at-rule-no-unknown */
    @starting-style {
      opacity: 0;
    }
  `;

const Content = styled.div`
  display: grid;
  gap: ${GAP};
  grid-template-rows: min-content 1fr;
  max-height: 100%;
  min-width: min-content;
  opacity: 1;
  transition: opacity 250ms ease-in;

  ${CONTENT_STARTING_STYLE}
`;

const DetailsBody = styled.ul`
  display: grid;
  gap: ${GAP};
  margin: 0;
  overflow-y: auto;
  padding: 0;
`;

const BOTTOM_BORDER_SEPARATOR = css`
  border-bottom: 1px dashed ${DesktopPalette.Gray40};
`;

const Header = styled.div`
  ${BOTTOM_BORDER_SEPARATOR}

  align-items: start;
  display: flex;
  justify-content: space-between;
  padding-bottom: ${GAP};
`;

const IconButton = styled.div`
  border-color: transparent;
  font-size: 0.75rem;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem; /* Squares out the button's dimensions. */

  :focus:focus-visible {
    ${INSET_FOCUS_OUTLINE}
  }
`;

const Import = styled.li`
  ${BOTTOM_BORDER_SEPARATOR}

  align-items: center;
  display: grid;
  gap: ${GAP};
  grid-template-columns: 1fr min-content min-content;
  padding-bottom: ${GAP};
`;

const Title = styled.div`
  display: grid;
`;

export function LocationCvrsPanel(props: LocationCvrsPanelProps): JSX.Element {
  const { closePanel, deleteImport, imports, name, type } = props;

  function scannerDetails(i: LocationCvrImport) {
    return i.scannerIds.length === 1
      ? `Scanner ${i.scannerIds[0]}`
      : `Scanners: ${i.scannerIds.join(', ')}`;
  }

  function formatExportDate(i: LocationCvrImport) {
    return format.localeShortDateAndTime(new Date(i.exportTimestamp));
  }

  return (
    <Container>
      <Content>
        <Header>
          <Title>
            <Caption>{pollingPlaceTypeName(type)}</Caption>
            <Font weight="bold">{name}</Font>
          </Title>
          <IconButton
            aria-label="Close Panel"
            as={Button}
            icon="X"
            onPress={closePanel}
            color="primary"
          />
        </Header>

        <DetailsBody>
          {imports.map((i) => (
            <Import key={i.id}>
              <Caption weight="semiBold">
                {i.source === 'network'
                  ? `${scannerDetails(i)} • ${i.filename}`
                  : formatExportDate(i)}
                <br />
                <Caption weight="regular">
                  {i.source === 'network' ? (
                    <React.Fragment>
                      <Icons.Network /> Network
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <Icons.UsbDrive /> USB
                      {' • '}
                      {scannerDetails(i)}
                    </React.Fragment>
                  )}
                </Caption>
              </Caption>

              <Font weight="bold">{format.count(i.numCvrsImported)}</Font>

              {deleteImport && (
                <IconButton
                  aria-label={`Remove CVR File From ${formatExportDate(i)}`}
                  as={Button<Id>}
                  color="danger"
                  icon="Trash"
                  onPress={deleteImport}
                  value={i.id}
                />
              )}
            </Import>
          ))}

          {imports.length === 0 && (
            <Callout>
              <CalloutContent>
                <Font weight="bold">
                  <Icons.Info /> No CVRs
                </Font>
                <span>
                  No files have been loaded from this location yet. When you are
                  ready, insert the USB drive containing an export from the
                  location and click &quot;Load&quot; to import it.
                </span>
              </CalloutContent>
            </Callout>
          )}
        </DetailsBody>
      </Content>
    </Container>
  );
}
