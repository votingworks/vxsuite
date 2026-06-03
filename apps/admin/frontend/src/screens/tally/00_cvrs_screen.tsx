/* istanbul ignore file */

import React, { useState } from 'react';
import styled, { css } from 'styled-components';

import { Icons, Button, Card, Font, ProgressBar } from '@votingworks/ui';
import { format } from '@votingworks/utils';

import { Locations } from './00_locations';
import {
  useCvrTotal,
  useIsTestCvrMode,
  useLayeredCards,
  useLayers,
  useLoadedPrecinctCount,
  usePollingPlaceCvrMap,
  usePollingPlaces,
  useSemiCollapsedSummaries,
} from './00_hooks';
import { FilterBar } from './00_filter_bar';
import { RemoveAllCvrsModal } from './00_remove_all_cvrs_modal';
import { CvrImportPanel } from './00_cvr_import_panel';
import { AppContext } from '../../contexts/app_context';
import * as api from '../../api';

const TestModeCard = styled(Card).attrs({ color: 'warning' })`
  > * {
    gap: 1rem;
    padding: var(--grid-gap) 1rem;
  }
`;

const TestModeCardContent = styled.div`
  display: grid;
  grid-template-rows: max-content 1fr;
  gap: 0.25rem;
`;

const MainContentContainer = styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  gap: var(--grid-gap);
  position: relative;
  height: 100%;
  overflow-x: visible;
  overflow-y: hidden;
`;

const ImportPanelContainer = styled.div`
  height: 100%;
  overflow-x: visible;
  overflow-y: hidden;
  position: relative;
`;

const Container = styled.div<{
  withTestBanner?: boolean;
}>`
  display: grid;
  gap: var(--grid-gap);
  grid-template-columns: 1fr;
  grid-template-rows: ${(p) =>
    p.withTestBanner ? 'min-content min-content 1fr' : 'min-content 1fr'};
  height: 100%;
  padding: var(--grid-gap);
`;

// [TODO] Remove - no longer needed.
const DeleteButtonContainer = styled.div`
  width: 100%;
`;

const layeredActionBarCss = css`
  > button {
    box-shadow: 0.125rem 0.125rem 0.25rem rgba(0, 0, 0, 25%);
    transition: all 200ms ease-in;
  }
`;

const ActionBar = styled.div<{ layered?: boolean }>`
  display: grid;
  gap: var(--grid-gap);
  grid-auto-columns: min-content;
  grid-auto-flow: column;
  grid-template-columns: 1fr;
  position: sticky;
  top: 0;

  > button {
    box-shadow: 0 0 0 rgba(0, 0, 0, 0%);
    transition: box-shadow 200ms ease-out;
  }

  ${(p) => p.layered && layeredActionBarCss}
`;

export function CvrsScreen(): React.ReactNode {
  const [isImportCvrModalOpen, setIsImportCvrModalOpen] = useState(false);

  const testMode = useIsTestCvrMode();

  const castVoteRecordFileList = usePollingPlaceCvrMap();
  const hasAnyFiles = castVoteRecordFileList
    .values()
    .some((meta) => meta.fileCount > 0);

  return (
    <Container withTestBanner={testMode}>
      {testMode && (
        <TestModeCard>
          <TestModeCardContent>
            <Font weight="bold">
              <Icons.Warning color="warning" /> Test Ballot Mode
            </Font>
            <Font style={{ fontSize: '0.8rem' }}>
              Remove all test CVRs once you have completed testing and are ready
              to tally official ballots.
            </Font>
          </TestModeCardContent>
        </TestModeCard>
      )}

      <Summaries />

      {isImportCvrModalOpen ? (
        <ImportPanel close={() => setIsImportCvrModalOpen(false)} />
      ) : (
        <MainContent
          openImportPanel={() => setIsImportCvrModalOpen(true)}
          withDeleteButton={hasAnyFiles}
        />
      )}
    </Container>
  );
}

export function MainContent(props: {
  openImportPanel: VoidFunction;
  withDeleteButton: boolean;
}): React.ReactNode {
  const { openImportPanel, withDeleteButton } = props;
  const { isOfficialResults } = React.useContext(AppContext);
  const layered = useLayers();

  const [isConfirmRemoveCvrsModalOpen, setIsConfirmRemoveCvrsModalOpen] =
    useState(false);

  const loading = api.getCastVoteRecordFiles.useQuery().isLoading;
  if (loading) return null;

  return (
    <MainContentContainer>
      <ActionBar layered={layered}>
        <FilterBar />
        {!isOfficialResults && (
          <Button icon="Import" variant="primary" onPress={openImportPanel}>
            Load
          </Button>
        )}
        {withDeleteButton && !isOfficialResults && (
          <DeleteButtonContainer>
            <Button
              icon="Trash"
              color="danger"
              disabled={isConfirmRemoveCvrsModalOpen}
              onPress={setIsConfirmRemoveCvrsModalOpen}
              value
            >
              Remove All
            </Button>
          </DeleteButtonContainer>
        )}
      </ActionBar>

      <Locations />

      {isConfirmRemoveCvrsModalOpen && (
        <RemoveAllCvrsModal
          onClose={() => setIsConfirmRemoveCvrsModalOpen(false)}
        />
      )}
    </MainContentContainer>
  );
}

export function ImportPanel(props: { close: VoidFunction }): React.ReactNode {
  const { close } = props;

  return (
    <ImportPanelContainer>
      <CvrImportPanel onClose={close} />
    </ImportPanelContainer>
  );
}

const SummaryCardContainer = styled(Card)`
  background-color: #f9f9f9;
  background-color: ${(p) => p.theme.colors.background};
  border: 1px solid #ccc;

  > * {
    display: grid;
    padding: var(--grid-gap) 0.75rem;
    gap: var(--grid-gap);
  }
`;

const semiCollapsedSummariesCss = css<{ layered?: boolean }>`
  --collapsed-border-radius: 0.175rem;

  gap: 0.25rem;

  ${SummaryCardContainer} {
    border: ${(p) => (p.layered ? '1px solid #ddd' : undefined)};
  }

  > :not(:last-child) {
    border-bottom-left-radius: var(--collapsed-border-radius);
    border-bottom-right-radius: var(--collapsed-border-radius);
  }

  > :not(:first-child) {
    border-top-left-radius: var(--collapsed-border-radius);
    border-top-right-radius: var(--collapsed-border-radius);
  }
`;

const detachedSummariesCss = css`
  gap: var(--grid-gap);
`;

const layeredSummaryCardCss = css`
  box-shadow: 0.125rem 0.125rem 0.25rem rgba(0, 0, 0, 10%);
`;

const CardContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  justify-items: start;
  text-align: right;

  * {
    line-height: 1 !important;
    margin: 0;
  }
`;

const CardFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  justify-items: start;
  text-align: right;

  > h4 {
    margin: 0;
  }
`;

const SummariesContainer = styled.div<{
  fullSize?: boolean;
  layered?: boolean;
  semiCollapsed?: boolean;
}>`
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  transition: all 200ms ease-out;

  ${SummaryCardContainer} {
    transition: all 200ms ease-out;
    ${(p) => p.layered && layeredSummaryCardCss}

    > * {
      gap: 0.35rem;
    }
  }

  ${CardContent} {
    align-items: center;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }

  ${CardFooter} {
    display: ${(p) => (p.fullSize ? undefined : 'none')};
  }

  ${(p) => (p.semiCollapsed ? semiCollapsedSummariesCss : detachedSummariesCss)}
`;

function Summaries() {
  const layered = useLayeredCards();
  const semiCollapsed = useSemiCollapsedSummaries();

  const totalCvrs = useCvrTotal();

  const nLocations = usePollingPlaces().length;
  const nLoaded = useLoadedPrecinctCount();

  const cvrMeta = usePollingPlaceCvrMap();
  const nScanners = React.useMemo(() => {
    if (!cvrMeta) return 0;

    const ids = new Set<string>();
    for (const meta of cvrMeta.values()) {
      for (const id of meta.machineIds) ids.add(id);
    }

    return ids.size;
  }, [cvrMeta]);

  const fullSize = true;

  return (
    <SummariesContainer
      fullSize={fullSize}
      layered={layered}
      semiCollapsed={semiCollapsed}
    >
      <ProgressCard title="Locations" current={nLoaded} total={nLocations} />
      <SummaryCard title="Scanners">{nScanners}</SummaryCard>
      <SummaryCard title="CVRs">{totalCvrs}</SummaryCard>
    </SummariesContainer>
  );
}
function SummaryCard(p: { title: string; children: number }) {
  const { children, title } = p;

  return (
    <SummaryCardContainer>
      <CardContent>
        <Font noWrap weight="semiBold">
          {title}
        </Font>
        <Font weight="bold" style={{ fontSize: '1.5rem' }}>
          {format.count(children)}
        </Font>
      </CardContent>
    </SummaryCardContainer>
  );
}

function ProgressCard(p: { current: number; title: string; total: number }) {
  const { current, title, total } = p;

  return (
    <SummaryCardContainer>
      <CardContent>
        <Font noWrap weight="semiBold">
          {title}
        </Font>
        <Font weight="bold" style={{ fontSize: '1.5rem' }}>
          {format.count(current)}{' '}
          <Font weight="bold" style={{ fontSize: '1.5rem' }}>
            / {format.count(total)}
          </Font>
        </Font>
      </CardContent>
      <CardFooter>
        <ProgressBar
          color={current === total ? 'primary' : 'primary'}
          progress={Math.min(1, current / total)}
        />
      </CardFooter>
    </SummaryCardContainer>
  );
}
