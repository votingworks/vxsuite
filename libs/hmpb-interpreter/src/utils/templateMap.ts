import { BallotLocales } from '@votingworks/types'
import { BallotPageLayout, BallotPageMetadata } from '../types'
import KeyedMap from './KeyedMap'

export type TemplateMapKey = [
  locales: BallotLocales | undefined,
  ballotStyleId: BallotPageMetadata['ballotStyleId'],
  precinctId: BallotPageMetadata['precinctId'],
  pageNumber: number
]
export type TemplateMap = KeyedMap<TemplateMapKey, BallotPageLayout | undefined>

export default function templateMap(): TemplateMap {
  return new KeyedMap(([locales, ballotStyleId, precinctId, pageNumber]) =>
    [
      locales?.primary,
      locales?.secondary,
      ballotStyleId,
      precinctId,
      pageNumber,
    ].join('-')
  )
}
