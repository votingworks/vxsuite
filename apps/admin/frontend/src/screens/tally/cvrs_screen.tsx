import React, { useState } from 'react';
import styled from 'styled-components';

import { Button, DesktopPalette } from '@votingworks/ui';

import { assertDefined } from '@votingworks/basics';
import { CvrSummaries } from './cvr_summaries';
import { GAP, INSET_FOCUS_OUTLINE } from './styles';
import { LocationFilter, LocationFilterBar } from './location_filter_bar';
import { RemoveAllCvrsModal } from './remove_all_cvrs_modal';
import { ImportCvrFilesModal } from './import_cvrfiles_modal';
import { CvrsState, useCvrsState } from './cvrs_state';
import { LocationList } from './location_list';

const Container = styled.div`
  display: grid;
  gap: ${GAP};
  grid-template-rows: min-content 1fr;
  height: 100%;
  overflow-y: hidden;
  padding: ${GAP} 0;

  > * {
    margin: 0 ${GAP};
  }
`;

export function CvrsScreen(): React.ReactNode {
  const [uiMode, setUiMode] = useState<'import' | 'view'>('view');

  const state = useCvrsState();
  if (!state) return null;

  return (
    <Container>
      {/* [TODO] Render test mode card. */}

      <CvrSummaries
        cvrs={state.totalCvrs}
        locations={{
          loaded: state.locationsLoaded,
          total: state.locations.length,
        }}
        scanners={state.scannersLoaded}
      />

      {uiMode === 'view' && (
        <ViewPanel openImportPanel={() => setUiMode('import')} state={state} />
      )}

      {/* [TODO] Render inline import panel instead of modal. */}
      {uiMode === 'import' && (
        <ImportCvrFilesModal onClose={() => setUiMode('view')} />
      )}
    </Container>
  );
}

const LOAD_BUTTON_CLASS = 'LoadButton';

const ActionBar = styled.div<{ layered?: boolean }>`
  display: grid;
  gap: ${GAP};
  grid-auto-columns: min-content;
  grid-auto-flow: column;
  grid-template-columns: 1fr;
  position: sticky;
  top: 0;

  > button:focus:focus-visible {
    ${INSET_FOCUS_OUTLINE}
  }

  > .${LOAD_BUTTON_CLASS} {
    box-shadow: 0.125rem 0.125rem 0.25rem rgba(0, 0, 0, 25%);

    :focus:focus-visible {
      /*
       * Create some contrast with the primary button color, since we're
       * insetting the outline.
       */
      outline-color: ${DesktopPalette.Purple40};
    }
  }
`;

const ViewPanelContainer = styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  gap: ${GAP};
  position: relative;
  height: 100%;
  margin: 0;
  overflow-y: hidden;

  > * {
    margin: 0 ${GAP};
  }
`;

export function ViewPanel(props: {
  openImportPanel: VoidFunction;
  state: CvrsState;
}): React.ReactNode {
  const { openImportPanel, state } = props;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [filter, setFilter] = React.useState<LocationFilter>('all');
  const [query, setQuery] = React.useState('');

  const showLoad = !state.isOfficialResults;
  const showDelete = state.files.length > 0 && !state.isOfficialResults;

  return (
    <ViewPanelContainer>
      <ActionBar>
        <LocationFilterBar
          filter={filter}
          nLoaded={state.locationsLoaded}
          nLocations={state.locations.length}
          query={query}
          setFilter={setFilter}
          setQuery={setQuery}
        />
        {showLoad && (
          <Button
            className={LOAD_BUTTON_CLASS}
            icon="Import"
            variant="primary"
            onPress={openImportPanel}
          >
            Load
          </Button>
        )}
        {showDelete && (
          <Button
            icon="Trash"
            color="danger"
            disabled={confirmingDelete}
            onPress={setConfirmingDelete}
            value
          >
            Remove All
          </Button>
        )}
        {confirmingDelete && (
          <RemoveAllCvrsModal onClose={() => setConfirmingDelete(false)} />
        )}
      </ActionBar>

      <LocationList
        locations={filterLocations(state, filter, query)}
        locationCvrs={state.locationCvrs}
      />
    </ViewPanelContainer>
  );
}

function filterLocations(
  state: CvrsState,
  filter: LocationFilter,
  query: string
) {
  const queryNormalized = query.trim().toLowerCase();

  if (filter === 'all' && !queryNormalized) return state.locations;

  return state.locations.filter((l) => {
    const cvrs = assertDefined(state.locationCvrs.get(l.id));
    if (filter === 'loaded' && cvrs.files.length === 0) return false;
    if (filter === 'pending' && cvrs.files.length > 0) return false;

    if (!queryNormalized) return true;

    return l.name.toLocaleLowerCase().includes(queryNormalized);
  });
}
