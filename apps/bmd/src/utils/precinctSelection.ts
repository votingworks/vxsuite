import { Precinct } from '@votingworks/types'
import { find } from '@votingworks/utils'
import { PrecinctSelection, PrecinctSelectionKind } from '../config/types'

export const AllPrecinctsDisplayName = 'All Precincts'

export function precinctSelectionName(
  precincts: readonly Precinct[],
  selection: PrecinctSelection
): string {
  return selection.kind === PrecinctSelectionKind.AllPrecincts
    ? AllPrecinctsDisplayName
    : find(precincts, (p) => p.id === selection.precinctId).name
}
