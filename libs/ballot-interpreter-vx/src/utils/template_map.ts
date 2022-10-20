import {
  BallotLocale,
  BallotPageLayoutWithImage,
  BallotPageMetadata,
} from '@votingworks/types';
import { KeyedMap } from './keyed_map';

export type TemplateMapKey = [
  locales: BallotLocale | undefined,
  ballotStyleId: BallotPageMetadata['ballotStyleId'],
  precinctId: BallotPageMetadata['precinctId'],
  pageNumber: number
];
export type TemplateMap = KeyedMap<
  TemplateMapKey,
  BallotPageLayoutWithImage | undefined
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
