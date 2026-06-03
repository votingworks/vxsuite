/* istanbul ignore file */

import React from 'react';
import styled from 'styled-components';
import { Button, Callout, Caption, Font, Icons } from '@votingworks/ui';
import { PollingPlace, pollingPlaceTypeName } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { PrecinctSummary } from './00_precinct_summary';
import * as api from '../../api';
import {
  PrecinctFilter,
  usePollingPlaceCvrMap,
  usePollingPlaces,
  usePrecinctFilter,
  usePrecinctSearch,
} from './00_hooks';
import { Tooltip, TooltipContainer } from './00_tooltip';
import { ConfirmDeleteCvrFileModal } from './00_confirm_delete_cvr_file_modal';

export interface PrecinctListProps {
  filter?: PrecinctFilter;
  search?: string;
}

const DetailsTitle = styled.div`
  display: grid;
`;

const DetailsHeader = styled.div`
  align-items: start;
  border-bottom: 1px dashed #aaa;
  display: flex;
  justify-content: space-between;
  padding-bottom: var(--grid-gap);
`;

const Batch = styled.div`
  align-items: center;
  border-bottom: 1px dashed #aaa;
  display: grid;
  grid-template-columns: 1fr min-content min-content;
  gap: var(--grid-gap);
  padding-bottom: var(--grid-gap);
`;

const DetailsBody = styled.div`
  align-items: start;
  align-items: center;
  display: grid;
  gap: var(--grid-gap);
`;

const Details = styled.div`
  min-width: 0;
  height: 100%;
  overflow: hidden;

  > * {
    display: grid;
    gap: var(--grid-gap);
    grid-template-rows: min-content 1fr;
    min-width: min-content;
    opacity: 1;
    transition: 250ms ease-in;
    transition-property: opacity;
    white-space: nowrap;

    /* stylelint-disable */
    @starting-style {
      opacity: 0;
    }
  }
`;

const IconButton = styled(Button<string | undefined>)`
  border-color: transparent;
  font-size: 0.75rem;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem;
`;

const DeleteButton = styled(Button<string>)`
  border-color: transparent;
  font-size: 0.75rem;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem;
`;

const Container = styled.div<{ expanded: boolean }>`
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: grid;
  grid-template-columns: 3fr ${(p) => (p.expanded ? 2 : 0)}fr;
  gap: var(--grid-gap);
  gap: ${(p) => (p.expanded ? 'var(--grid-gap)' : 0)};
  height: 100%;
  outline-offset: -${(p) => p.theme.sizes.bordersRem.medium}rem;
  overflow-x: hidden;
  overflow-y: auto;
  overflow-y: hidden;
  transition: 150ms ease-out;
  transition-property: gap, grid-template-columns;
  scroll-padding-bottom: 1rem;
  scroll-padding-top: 1rem;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--grid-gap);
  justify-items: start;
  overflow-y: auto;
  padding-right: 0.125rem; /* Make room for scrollbar. */
`;

const CalloutContent = styled(Caption)`
  align-items: start;
  color: #444;
  display: grid;
  gap: var(--grid-gap);
  grid-template-rows: min-content 1fr;
  white-space: normal;
`;

export function Locations(): React.ReactNode {
  const [fileIdToDelete, setFileIdToDelete] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<string | undefined>(
    undefined
  );

  const itemRefs = React.useRef<Array<HTMLDivElement | null>>([]);

  const cvrMeta = usePollingPlaceCvrMap();
  const files = api.getCastVoteRecordFiles.useQuery().data;
  const filter = usePrecinctFilter();
  const places = usePollingPlaces();
  const search = usePrecinctSearch();

  const deleteCvrFile = api.deleteCvrFile.useMutation();

  const filteredPlaces = React.useMemo(() => {
    if (!places) return [];
    const searchLower = search?.toLowerCase();

    if (filter === 'all') {
      return searchLower
        ? places.filter((p) => p.name.toLowerCase().includes(searchLower))
        : places;
    }

    const filtered: PollingPlace[] = [];
    for (const p of places) {
      const meta = assertDefined(cvrMeta?.get(p.id));
      if (!meta.fileCount && filter === 'loaded') continue;
      if (meta.fileCount && filter === 'pending') continue;
      if (searchLower && !p.name.toLowerCase().includes(searchLower)) continue;

      filtered.push(p);
    }

    return filtered;
  }, [cvrMeta, filter, places, search]);

  const sortedFiles = [...(files || [])].sort((a, b) =>
    a.exportTimestamp.localeCompare(b.exportTimestamp)
  );

  const expandedPlace = filteredPlaces.find((p) => p.id === expandedId);
  if (expandedId && !expandedPlace) {
    setExpandedId(undefined);
  }

  if (!files) return null;

  let expandedHasCvrs = false;
  const locationFiles =
    expandedId &&
    sortedFiles.map((f) => {
      if (!(f.pollingPlaceIds || []).includes(expandedId)) return null;

      expandedHasCvrs = true;

      return (
        <Batch key={f.id}>
          <Caption weight="semiBold">
            {format.localeShortDateAndTime(new Date(f.exportTimestamp))}
            <br />
            {f.scannerIds.length === 1 ? (
              <Caption weight="regular">Scanner {f.scannerIds[0]}</Caption>
            ) : (
              <Caption weight="regular">
                Scanners: {f.scannerIds.join(', ')}
              </Caption>
            )}
          </Caption>

          <Font weight="bold">{format.count(f.numCvrsImported)}</Font>

          <TooltipContainer>
            <DeleteButton
              color="danger"
              disabled={deleteCvrFile.isLoading}
              icon="Trash"
              onPress={setFileIdToDelete}
              value={f.id}
            />
            <Tooltip alignTo="right" style={{ fontSize: '0.75rem' }}>
              Delete File
            </Tooltip>
          </TooltipContainer>
        </Batch>
      );
    });

  return (
    <Container expanded={!!expandedId}>
      <List>
        {filteredPlaces.map((p, i) => (
          <div
            key={p.id}
            data-index={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
          >
            <PrecinctSummary
              key={`${filter}-${search || 'all'}-${p.id}`}
              {...p}
              onSelect={(id) =>
                setExpandedId(id === expandedId ? undefined : id)
              }
              selected={p.id === expandedId}
            />
          </div>
        ))}
      </List>

      <Details>
        {expandedPlace && (
          <div>
            <DetailsHeader>
              <DetailsTitle>
                <Caption>{pollingPlaceTypeName(expandedPlace.type)}</Caption>
                <Font weight="bold">{expandedPlace.name}</Font>
              </DetailsTitle>
              <IconButton
                rightIcon="X"
                onPress={setExpandedId}
                value={undefined}
                color="primary"
              />
            </DetailsHeader>

            <DetailsBody>
              {locationFiles}
              {!expandedHasCvrs && (
                <Callout>
                  <CalloutContent>
                    <Font weight="bold">
                      <Icons.Info /> No CVRs
                    </Font>
                    <span>
                      No files have been loaded from this location yet. When you
                      are ready, insert the USB drive containing an export from
                      the location and click &quot;Load&quot; to import it.
                    </span>
                  </CalloutContent>
                </Callout>
              )}
            </DetailsBody>
          </div>
        )}
      </Details>

      {fileIdToDelete && (
        <ConfirmDeleteCvrFileModal
          fileId={fileIdToDelete}
          onClose={() => setFileIdToDelete('')}
        />
      )}
    </Container>
  );
}
