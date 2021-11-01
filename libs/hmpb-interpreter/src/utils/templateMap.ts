import {
  BallotLocales,
  BallotPageLayout,
  BallotPageMetadata,
} from '@votingworks/types';
import { KeyedMap } from './KeyedMap';

export type TemplateMapKey = [
  locales: BallotLocales | undefined,
  ballotStyleId: BallotPageMetadata['ballotStyleId'],
  precinctId: BallotPageMetadata['precinctId'],
  pageNumber: number
];
export type TemplateMap = KeyedMap<
  TemplateMapKey,
  BallotPageLayout | undefined
>;

export function templateMap(): TemplateMap {
  return new KeyedMap(([locales, ballotStyleId, precinctId, pageNumber]) =>
    [
      locales?.primary,
      locales?.secondary,
      ballotStyleId,
      precinctId,
      pageNumber,
    ].join('-')
  );
}
