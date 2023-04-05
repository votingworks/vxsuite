import {
  BallotLocale,
  BallotPageLayoutWithImage,
  BallotPageMetadata,
} from '@votingworks/types';
import { KeyedMap } from './keyed_map';

export type TemplateMapKey = [
  /**
   * @deprecated to be replaced (https://github.com/votingworks/roadmap/issues/15)
   */
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
