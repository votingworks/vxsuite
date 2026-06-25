import React from 'react';

import type { CastVoteRecordFileRecord } from '@votingworks/admin-backend';
import { Id, PollingPlace } from '@votingworks/types/src';
import { assertDefined } from '@votingworks/basics';

import * as api from '../../api';
import { AppContext } from '../../contexts/app_context';

export interface CvrsState {
  files: CastVoteRecordFileRecord[];
  isOfficialResults: boolean;
  locationCvrs: Map<Id, LocationCvrs>;
  locations: readonly PollingPlace[];
  locationsLoaded: number;
  scannersLoaded: number;
  testMode: boolean;
  totalCvrs: number;
}

export interface LocationCvrs {
  cvrCount: number;
  files: CastVoteRecordFileRecord[];
  scannerIds: Set<string>;
}

export function useCvrsState(): CvrsState | null {
  const ctx = React.useContext(AppContext);
  const { electionDefinition, isOfficialResults } = ctx;
  const { election } = assertDefined(electionDefinition);
  const locations = election.pollingPlaces;

  const files = api.getCastVoteRecordFiles.useQuery().data;
  const mode = api.getCastVoteRecordFileMode.useQuery().data;

  return React.useMemo((): CvrsState | null => {
    if (!files || !mode) return null;

    const testMode = mode === 'test';
    const locationCvrs = buildLocationCvrMap(locations, files);

    let totalCvrs = 0;
    let locationsLoaded = 0;
    let scannersLoaded = 0;
    for (const meta of locationCvrs.values()) {
      totalCvrs += meta.cvrCount;
      if (meta.files.length > 0) locationsLoaded += 1;
      if (meta.scannerIds.size > 0) scannersLoaded += 1;
    }

    return {
      files,
      isOfficialResults,
      locationCvrs,
      locations,
      locationsLoaded,
      scannersLoaded,
      testMode,
      totalCvrs,
    };
  }, [files, isOfficialResults, locations, mode]);
}

function buildLocationCvrMap(
  places: readonly PollingPlace[],
  files: CastVoteRecordFileRecord[]
): Map<Id, LocationCvrs> {
  const map = new Map(
    places.map<[Id, LocationCvrs]>((p) => [
      p.id,
      {
        absenteeCount: 0,
        earlyVotingCount: 0,
        cvrCount: 0,
        files: [],
        scannerIds: new Set(),
      },
    ])
  );

  for (const file of files) {
    const placeId = assertDefined(
      file.pollingPlaceIds[0],
      'missing polling place ID in CVR export'
    );

    const meta = assertDefined(
      map.get(placeId),
      'invalid polling place ID in CVR export'
    );

    meta.cvrCount += file.numCvrsImported;
    meta.files.push(file);
    for (const id of file.scannerIds) meta.scannerIds.add(id);
  }

  return map;
}
