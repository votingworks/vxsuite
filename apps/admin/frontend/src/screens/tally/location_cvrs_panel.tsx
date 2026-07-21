import React from 'react';
import styled, { css } from 'styled-components';
import { assertDefined } from '@votingworks/basics';

import {
  Button,
  Callout,
  Caption,
  DesktopPalette,
  Font,
  Icons,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { PollingPlaceType, pollingPlaceTypeName } from '@votingworks/types';
import type { CastVoteRecordFileRecord } from '@votingworks/admin-backend';
import { GAP, INSET_FOCUS_OUTLINE } from './styles';
import { SearchBox } from './search_box';

export interface LocationCvrsPanelProps {
  closePanel: () => void;
  imports: LocationCvrImport[];
  name: string;
  onDeleteImport?: (cvrImport: LocationCvrImport) => void;
  type: PollingPlaceType;
}

export type LocationCvrImport = Pick<
  CastVoteRecordFileRecord,
  | 'id'
  | 'exportTimestamp'
  | 'numCvrsImported'
  | 'scannerIds'
  | 'source'
  | 'batchLabels'
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

/*
 * istanbul ignore next - @starting-style rule is incompatible with our
 * current jsdom version.
 */
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

const TopSection = styled.div`
  display: grid;
  gap: ${GAP};
`;

// Titles an import by its scanner and batch, e.g. "Scanner 0001, Batch 1".
// Imports from a networked central scanner contain exactly one batch, so the
// batch label is shown directly; multi-batch (or multi-scanner) USB files are
// summarized by count instead.
export function cvrImportTitle(i: LocationCvrImport): string {
  const scannerPart =
    i.scannerIds.length === 1
      ? `Scanner ${i.scannerIds[0]}`
      : `${i.scannerIds.length} scanners`;
  const batchPart =
    i.batchLabels.length === 1
      ? assertDefined(i.batchLabels[0])
      : `${i.batchLabels.length} batches`;
  return i.batchLabels.length === 0
    ? scannerPart
    : `${scannerPart}, ${batchPart}`;
}

export function LocationCvrsPanel(props: LocationCvrsPanelProps): JSX.Element {
  const { closePanel, imports, name, onDeleteImport, type } = props;
  const [query, setQuery] = React.useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredImports = imports.filter((i) =>
    [
      cvrImportTitle(i),
      format.localeShortDateAndTime(new Date(i.exportTimestamp)),
      ...i.batchLabels,
      ...i.scannerIds,
    ].some((text) => text.toLowerCase().includes(normalizedQuery))
  );

  return (
    <Container>
      <Content>
        <TopSection>
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

          {imports.length > 0 && (
            <SearchBox
              placeholder="Search Files"
              query={query}
              setQuery={setQuery}
            />
          )}
        </TopSection>

        <DetailsBody>
          {filteredImports.map((i) => (
            <Import key={i.id}>
              <Caption weight="semiBold">
                {cvrImportTitle(i)}
                <br />
                <Caption weight="regular">
                  {format.localeShortDateAndTime(new Date(i.exportTimestamp))}
                  {' • '}
                  {i.source === 'network' ? (
                    <React.Fragment>
                      <Icons.Sitemap /> Network
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <Icons.UsbDrive /> USB
                    </React.Fragment>
                  )}
                </Caption>
              </Caption>

              <Font weight="bold">{format.count(i.numCvrsImported)}</Font>

              {onDeleteImport && (
                <IconButton
                  aria-label={`Remove ${cvrImportTitle(i)}`}
                  as={Button}
                  icon="Trash"
                  color="danger"
                  onPress={() => onDeleteImport(i)}
                />
              )}
            </Import>
          ))}

          {imports.length > 0 && filteredImports.length === 0 && (
            <Callout>
              <CalloutContent>
                <Font weight="bold">
                  <Icons.Info /> No imports match &ldquo;{query.trim()}&rdquo;
                </Font>
              </CalloutContent>
            </Callout>
          )}

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
