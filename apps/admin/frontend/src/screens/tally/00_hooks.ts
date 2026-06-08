/* istanbul ignore file */

import React from 'react';
import { atom, useAtomValue, useSetAtom } from 'jotai';

import type { CvrFileMode } from '@votingworks/admin-backend';
import { assertDefined } from '@votingworks/basics';
import { Id, PollingPlace, PollingPlacePrecinct } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';
import * as api from '../../api';

export function useCvrMode(): CvrFileMode | undefined {
  const mode = api.getCastVoteRecordFileMode.useQuery().data;
  return mode;
}

export function useIsTestCvrMode(): boolean | undefined {
  return useCvrMode() === 'test';
}

export interface LocationCvrs {
  absenteeCount: number;
  earlyVotingCount: number;
  count: number;
  machineIds: Set<string>;
  fileCount: number;
}

export function usePollingPlaces(): readonly PollingPlace[] {
  const { electionDefinition } = React.useContext(AppContext);
  const { election } = assertDefined(electionDefinition);
  const realPlaces = assertDefined(election.pollingPlaces);
  const { precincts } = election;

  return React.useMemo((): PollingPlace[] => {
    // Absentee polling places aren't yet supported in the tally screen, but
    // can't be removed from the election definition (they back live reports),
    // so filter them out here. The synthetic Central Scanning placeholder is
    // added separately below and so is unaffected.
    const copy = realPlaces.filter((p) => p.type !== 'absentee');

    copy.push({
      id: 'central-scanning',
      name: 'Central Scanning',
      precincts: Object.fromEntries(
        precincts.map((p): [Id, PollingPlacePrecinct] => [
          p.id,
          { type: 'whole' },
        ])
      ),
      type: 'absentee',
    });

    // eslint-disable-next-line vx/no-array-sort-mutation
    return copy.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        ignorePunctuation: true,
        numeric: true,
      })
    );
  }, [precincts, realPlaces]);
}

export function usePollingPlaceCvrs(id: string): LocationCvrs | null {
  const map = usePollingPlaceCvrMap();
  return map.get(id) || null;
}

export function usePollingPlaceCvrMap(): Map<Id, LocationCvrs> {
  const places = usePollingPlaces();
  const files = api.getCastVoteRecordFiles.useQuery().data;

  return React.useMemo(() => {
    if (!files) return new Map<Id, LocationCvrs>();

    const map = new Map<Id, LocationCvrs>(
      places.map<[Id, LocationCvrs]>((p) => [
        p.id,
        {
          absenteeCount: 0,
          earlyVotingCount: 0,
          count: 0,
          fileCount: 0,
          machineIds: new Set(),
        },
      ])
    );

    for (const file of files) {
      if (!file.pollingPlaceIds || file.pollingPlaceIds.length === 0) continue;

      const meta = map.get(file.pollingPlaceIds[0]);
      if (!meta) continue;

      meta.count += file.numCvrsImported;
      meta.fileCount += 1;
      for (const id of file.scannerIds) meta.machineIds.add(id);
    }

    return map;
  }, [files, places]);
}

export function useLoadedPrecinctCount(): number {
  const map = usePollingPlaceCvrMap();
  if (!map) return 0;

  let n = 0;
  for (const meta of map.values()) n += meta.fileCount ? 1 : 0;

  return n;
}

export interface CvrTotals {
  early: number;
  absentee: number;
  electionDay: number;
}

export function useCvrTotal(): number {
  const map = usePollingPlaceCvrMap();
  if (!map) return 0;

  let total = 0;
  for (const meta of map.values()) total += meta.count;

  return total;
}

export type PrecinctFilter = 'all' | 'loaded' | 'pending';

const precinctFilter = atom<PrecinctFilter>('all');

export function usePrecinctFilter(): PrecinctFilter {
  return useAtomValue(precinctFilter);
}

export function useSetPrecinctFilter(): (f: PrecinctFilter) => void {
  return useSetAtom(precinctFilter);
}

const precinctSearch = atom('');

export function usePrecinctSearch(): string {
  return useAtomValue(precinctSearch);
}

export function useSetPrecinctSearch(): (s: string) => void {
  return useSetAtom(precinctSearch);
}

const hasManualTallies = atom(false);

export function useHasManualTallies(): boolean {
  return useAtomValue(hasManualTallies);
}

export function useSetHasManualTallies(): (val: boolean) => void {
  return useSetAtom(hasManualTallies);
}

// DEV

export type FilterBarMode = 'filterFirst' | 'searchFirst';

const filterBarMode = atom<FilterBarMode>(() => 'searchFirst');

export function useFilterBarMode(): FilterBarMode {
  return useAtomValue(filterBarMode);
}

export const semiCollapsedSummaries = atom(false);

export function useSemiCollapsedSummaries(): boolean {
  return useAtomValue(semiCollapsedSummaries);
}

export const layers = atom(true);

export function useLayers(): boolean {
  return useAtomValue(layers);
}

export const layeredCards = atom(false);

export function useLayeredCards(): boolean {
  return useAtomValue(layeredCards);
}

export const shadedBg = atom(false);

export function useShadedBg(): boolean {
  return useAtomValue(shadedBg);
}

export const alphaStrip = atom(false);

export function useAlphaStrip(): boolean {
  return useAtomValue(alphaStrip);
}
