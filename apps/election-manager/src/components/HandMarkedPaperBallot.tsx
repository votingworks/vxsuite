import React, { useContext } from 'react'
import { useTranslation, Trans } from 'react-i18next'

import {
  HandMarkedPaperBallot as HMPB,
  HandMarkedPaperBallotProps,
} from '@votingworks/hmpb-ui'

import { OptionalElection, withLocale } from '@votingworks/ballot-encoder'
import { ABSENTEE_TINT_COLOR } from '../config/globals'
import AppContext from '../contexts/AppContext'

type HandMarkedPaperBallotPassthroughProps = Omit<
  HandMarkedPaperBallotProps,
  't' | 'Trans'
>

const HandMarkedPaperBallotPassthrough = (
  props: HandMarkedPaperBallotPassthroughProps
) => {
  const { printBallotRef } = useContext(AppContext)
  const { election, locales } = props
  const { t, i18n } = useTranslation()
  const localeElection: OptionalElection = locales.secondary
    ? withLocale(election, locales.secondary)
    : undefined

  i18n.addResources(locales.primary, 'translation', election.ballotStrings)
  if (localeElection && locales.secondary) {
    i18n.addResources(
      locales.secondary,
      'translation',
      localeElection.ballotStrings
    )
  }

  return (
    <HMPB
      {...props}
      absenteeTintColor={ABSENTEE_TINT_COLOR}
      printBallotRef={printBallotRef}
      t={t}
      Trans={Trans}
    />
  )
}

export default HandMarkedPaperBallotPassthrough
