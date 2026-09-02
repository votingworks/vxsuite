import React from 'react';
import styled from 'styled-components';

import { Id, PollingPlace } from '@votingworks/types';
import { Caption, Card, Font, H4, Icons } from '@votingworks/ui';
import type {
  CastVoteRecordFileMetadata as CvrExport,
  CvrFileMode,
} from '@votingworks/admin-backend';

import { CvrImporter } from './cvr_importer.js';
import { GAP } from './styles.js';
import { LocationImportCard, Status } from './location_import_card.js';

const Container = styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  gap: ${GAP};
  position: relative;
  height: 100%;
  overflow-y: auto;
`;

const Exports = styled.div`
  display: grid;
  gap: ${GAP};
  grid-auto-rows: min-content;
`;

const DISABLED_STATES: Record<CvrImporter['state'], boolean> = {
  duplicate: true,
  error: true,
  importing: true,
  init: false,
  loading: true,
  noUsb: true,
  success: false,
};

const EXPORTS_LABEL: Record<CvrFileMode, string> = {
  official: 'official ballot CVR exports',
  test: 'test ballot CVR exports',
  unlocked: 'CVR exports',
};

type Importer = Exclude<CvrImporter, { state: 'loading' | 'noUsb' }>;

export function CvrUsbExports(props: { importer: Importer }): React.ReactNode {
  const { importer } = props;
  const { electionDefinition } = importer;
  const { pollingPlaces } = electionDefinition.election;

  const locationMap = React.useMemo(() => {
    const map = new Map<Id, PollingPlace>();
    for (const p of pollingPlaces) map.set(p.id, p);
    return map;
  }, [pollingPlaces]);

  const { mode } = importer.existingImports;

  const eligibleExports = [...importer.usbExports]
    .filter((e) => {
      if (mode === 'official' && e.isTestModeResults) return false;
      if (mode === 'test' && !e.isTestModeResults) return false;
      return true;
    })
    .sort((a, b) => {
      const timeA = a.exportTimestamp.valueOf();
      const timeB = b.exportTimestamp.valueOf();
      return timeB - timeA;
    });

  if (eligibleExports.length === 0) {
    return <NoCvrs mode={mode} />;
  }

  const numNewExports = eligibleExports.filter(
    (e) => getStatus(e, importer) !== 'imported'
  ).length;

  function startImport(path: string) {
    switch (importer.state) {
      case 'duplicate':
      case 'error':
      case 'importing':
        // @coverage-exclude: UI blocked by parent modals in these states
        return;

      default:
        importer.import({ path });
    }
  }

  return (
    <Container>
      <Caption>
        <Icons.Info />{' '}
        {numNewExports === 0 ? (
          <React.Fragment>
            No new {EXPORTS_LABEL[mode]} were found on the USB drive.
          </React.Fragment>
        ) : (
          <React.Fragment>
            The following {EXPORTS_LABEL[mode]} were found on the USB drive:
          </React.Fragment>
        )}
      </Caption>
      <Exports>
        {eligibleExports.map((e) => {
          const locationId = e.pollingPlaceIds[0];
          const location = locationMap.get(locationId);

          // @coverage-exclude: unreachable in practice, but doesn't warrant a crash.
          if (!location) return null;

          return (
            <LocationImportCard
              disabled={DISABLED_STATES[importer.state]}
              exportTimestamp={e.exportTimestamp}
              key={e.path}
              name={location.name}
              nCvrs={e.cvrCount}
              onPress={startImport}
              path={e.path}
              scannerIds={e.scannerIds}
              status={getStatus(e, importer)}
              testExport={e.isTestModeResults}
              type={location.type}
            />
          );
        })}
      </Exports>
    </Container>
  );
}

function NoCvrs(props: { mode: CvrFileMode }) {
  const { mode } = props;

  const exportsLabel = EXPORTS_LABEL[mode];

  return (
    <div>
      <Card style={{ maxWidth: 'max-content' }}>
        <H4>
          <Icons.Info style={{ marginRight: GAP }} />
          No New CVRs Found
        </H4>
        <Font>
          Insert a USB drive containing {exportsLabel} from a scanner.
        </Font>
      </Card>
    </div>
  );
}

function getStatus(e: CvrExport, importer: Importer): Status {
  if (importer.state === 'importing' && importer.path === e.path) {
    return 'importing';
  }

  for (const existing of importer.existingImports.imports) {
    if (existing.filename !== e.name) continue;
    if (existing.exportTimestamp !== e.exportTimestamp.toISOString()) continue;
    return 'imported';
  }

  return 'ready';
}
