import { BallotType } from '@votingworks/types'
import {
  BallotLocales,
  BallotPageMetadata,
} from '@votingworks/hmpb-interpreter'
import React from 'react'
import styled from 'styled-components'
import { BallotMetadata, PageInterpretation } from '../config/types'

const Title = styled.span`
  font-weight: 500;
`

function describeBallotType(ballotType: BallotType): string {
  switch (ballotType) {
    case 0:
      return 'standard'
    case 1:
      return 'absentee'
    case 2:
      return 'provisional'
    default:
      return 'unknown'
  }
}

function describeLocales(locales: BallotLocales): string {
  if (locales.secondary) {
    return `${locales.primary}/${locales.secondary}`
  }
  return locales.primary
}

function describeMetadata(
  metadata: BallotMetadata | BallotPageMetadata
): string {
  const { ballotStyleId, precinctId, ballotType, locales } = metadata
  const description = `bs=${ballotStyleId} pr=${precinctId} type=${describeBallotType(
    ballotType
  )} l10n=${describeLocales(locales)}`

  if ('pageNumber' in metadata) {
    return `page=${metadata.pageNumber} ${description}`
  }
  return description
}

function interpretationTitle(interpretation: PageInterpretation) {
  switch (interpretation.type) {
    case 'BlankPage':
      return 'blank'

    case 'InterpretedBmdPage':
      return 'BMD'

    case 'InterpretedHmpbPage':
      return 'HMPB'

    case 'InvalidTestModePage':
      return 'invalid test mode'

    case 'UninterpretedHmpbPage':
      return 'HMPB (uninterpreted)'

    case 'UnreadablePage':
      return 'unreadable'

    case 'InvalidElectionHashPage':
      return 'invalid election'

    default:
      // @ts-expect-error - future-proofing in case the enum is out of date
      return interpretation.type
  }
}

export interface Props {
  url: string
  interpretation: PageInterpretation
}

const DebugSheetPageCell: React.FC<Props> = ({ url, interpretation }) => {
  return (
    <td>
      <a href={url}>
        <Title>{interpretationTitle(interpretation)}</Title>
        <span>
          {'metadata' in interpretation
            ? describeMetadata(interpretation.metadata)
            : 'n/a'}
        </span>
      </a>
    </td>
  )
}

export default DebugSheetPageCell
