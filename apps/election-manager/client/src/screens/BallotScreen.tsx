import React, { useContext, useState } from 'react'
import { useParams, useHistory } from 'react-router-dom'
import {
  getBallotStyle,
  getContests,
  getPrecinctById,
  getElectionLocales,
} from '@votingworks/ballot-encoder'
import pluralize from 'pluralize'

import { BallotScreenProps, BallotLocale } from '../config/types'
import AppContext from '../contexts/AppContext'

import Button, { SegmentedButton } from '../components/Button'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'
import { Monospace } from '../components/Text'
import { getBallotPath, getHumanBallotLanguageFormat } from '../utils/election'
import NavigationScreen from '../components/NavigationScreen'
import HorizontalRule from '../components/HorizontalRule'
import { DEFAULT_LOCALE } from '../config/globals'
import { routerPaths } from '../components/ElectionManager'

const BallotScreen = () => {
  const history = useHistory()
  const {
    precinctId,
    ballotStyleId,
    localeCode: currentLocaleCode,
  } = useParams<BallotScreenProps>()
  const { election: e, electionHash } = useContext(AppContext)
  const election = e!
  const availableLocaleCodes = getElectionLocales(election, DEFAULT_LOCALE)
  const locales: BallotLocale = {
    primary: DEFAULT_LOCALE,
    secondary: currentLocaleCode,
  }

  const precinctName = getPrecinctById({ election, precinctId })?.name
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const ballotContests = getContests({ ballotStyle, election })

  const [isLiveMode, setIsLiveMode] = useState(true)
  const toggleLiveMode = () => setIsLiveMode((m) => !m)
  const changeLocale = (localeCode: string) =>
    history.replace(
      localeCode === DEFAULT_LOCALE
        ? routerPaths.ballotsView({ precinctId, ballotStyleId })
        : routerPaths.ballotsViewLanguage({
            precinctId,
            ballotStyleId,
            localeCode,
          })
    )

  const filename = getBallotPath({
    ballotStyleId,
    election,
    electionHash,
    precinctId,
    locales,
    isLiveMode,
  })

  const printBallot = async () => {
    const documentTitle = document.title
    document.title = filename
    await (window.kiosk ?? window).print()
    document.title = documentTitle
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <h1>
          Ballot Style <strong>{ballotStyleId}</strong> for {precinctName}
        </h1>
        <p>
          <SegmentedButton>
            <Button disabled={isLiveMode} onPress={toggleLiveMode} small>
              Live Mode
            </Button>
            <Button disabled={!isLiveMode} onPress={toggleLiveMode} small>
              Test Mode
            </Button>
          </SegmentedButton>{' '}
          {availableLocaleCodes.length > 1 && (
            <SegmentedButton>
              {availableLocaleCodes.map((localeCode) => (
                <Button
                  disabled={
                    currentLocaleCode
                      ? localeCode === currentLocaleCode
                      : localeCode === DEFAULT_LOCALE
                  }
                  key={localeCode}
                  onPress={() => changeLocale(localeCode)}
                  small
                >
                  {getHumanBallotLanguageFormat({
                    primary: DEFAULT_LOCALE,
                    secondary:
                      localeCode === DEFAULT_LOCALE ? undefined : localeCode,
                  })}
                </Button>
              ))}
            </SegmentedButton>
          )}
        </p>
        <p>
          <Button primary onPress={printBallot}>
            {availableLocaleCodes.length > 1 && currentLocaleCode
              ? `Print ${
                  isLiveMode ? 'Official Ballot' : 'Test Ballot'
                } in ${getHumanBallotLanguageFormat(locales)}`
              : `Print ${isLiveMode ? 'Official Ballot' : 'Test Ballot'}`}
          </Button>
        </p>
        <p>
          Filename: <Monospace>{filename}</Monospace>
        </p>
        <HorizontalRule />
        <p>
          <strong>Ballot style {ballotStyle.id}</strong> has the following{' '}
          <strong>{pluralize('contest', ballotContests.length, true)}</strong>.
        </p>
        {ballotContests.map((contest) => (
          <React.Fragment key={contest.id}>
            <h3>{contest.title}</h3>
            {contest.type === 'candidate' ? (
              <ul>
                {contest.candidates.map((candidate) => (
                  <li key={candidate.id}>{candidate.name}</li>
                ))}
              </ul>
            ) : (
              <ul>
                <li>Yes</li>
                <li>No</li>
              </ul>
            )}
          </React.Fragment>
        ))}
        <HorizontalRule />
      </NavigationScreen>
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        isLiveMode={isLiveMode}
        precinctId={precinctId}
        locales={locales}
      />
    </React.Fragment>
  )
}

export default BallotScreen
