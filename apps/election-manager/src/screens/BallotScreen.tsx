import React, { useContext, useState } from 'react'
import { useParams, useHistory } from 'react-router-dom'
import styled from 'styled-components'
import DOMPurify from 'dompurify'
import {
  getBallotStyle,
  getContests,
  getPrecinctById,
  getElectionLocales,
} from '@votingworks/ballot-encoder'
import pluralize from 'pluralize'

import {
  BallotScreenProps,
  BallotLocale,
  InputEventFunction,
} from '../config/types'
import AppContext from '../contexts/AppContext'

import Button, { SegmentedButton } from '../components/Button'
import PrintButton from '../components/PrintButton'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'
import Text, { Monospace } from '../components/Text'
import { getBallotPath, getHumanBallotLanguageFormat } from '../utils/election'
import NavigationScreen from '../components/NavigationScreen'
import HorizontalRule from '../components/HorizontalRule'
import { DEFAULT_LOCALE } from '../config/globals'
import routerPaths from '../routerPaths'
import TextInput from '../components/TextInput'
import LinkButton from '../components/LinkButton'

const BallotCopiesInput = styled(TextInput)`
  width: 4em;
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    opacity: 1;
  }
`

const BallotScreen: React.FC = () => {
  const history = useHistory()
  const {
    precinctId,
    ballotStyleId,
    localeCode: currentLocaleCode,
  } = useParams<BallotScreenProps>()
  const { electionDefinition, addPrintedBallot } = useContext(AppContext)
  const { election, electionHash } = electionDefinition!
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
  const [isAbsenteeMode, setIsAbsenteeMode] = useState(true)
  const toggleAbsenteeMode = () => setIsAbsenteeMode((m) => !m)
  const [ballotCopies, setBallotCopies] = useState(1)
  const updateBallotCopies: InputEventFunction = (event) => {
    const { value } = event.currentTarget
    const copies = value ? parseInt(value, 10) : 1
    setBallotCopies(copies < 1 ? 1 : copies)
  }
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

  const afterPrint = (numCopies: number) => {
    if (isLiveMode) {
      addPrintedBallot({
        ballotStyleId,
        precinctId,
        locales,
        numCopies,
        printedAt: new Date().toISOString(),
      })
    }
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
              Official
            </Button>
            <Button disabled={!isLiveMode} onPress={toggleLiveMode} small>
              Test
            </Button>
          </SegmentedButton>{' '}
          <SegmentedButton>
            <Button
              disabled={isAbsenteeMode}
              onPress={toggleAbsenteeMode}
              small
            >
              Absentee
            </Button>
            <Button
              disabled={!isAbsenteeMode}
              onPress={toggleAbsenteeMode}
              small
            >
              Precinct
            </Button>
          </SegmentedButton>{' '}
          Copies{' '}
          <BallotCopiesInput
            name="copies"
            defaultValue={ballotCopies}
            type="number"
            min={1}
            step={1}
            pattern="\d*"
            onChange={updateBallotCopies}
          />
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
          <PrintButton
            primary
            title={filename}
            afterPrint={() => afterPrint(ballotCopies)}
            copies={ballotCopies}
            warning={!isLiveMode}
          >
            Print {ballotCopies}{' '}
            {isLiveMode ? 'Official' : <strong>Test</strong>}{' '}
            {isAbsenteeMode ? <strong>Absentee</strong> : 'Precinct'}{' '}
            {pluralize('Ballot', ballotCopies)}{' '}
            {availableLocaleCodes.length > 1 &&
              currentLocaleCode &&
              ` in ${getHumanBallotLanguageFormat(locales)}`}
          </PrintButton>
        </p>
        <p>
          <LinkButton small to={routerPaths.ballotsList}>
            Back to List Ballots
          </LinkButton>
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
            ) : null}
            {contest.type === 'yesno' ? (
              <React.Fragment>
                <Text
                  preLine
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(contest.description),
                  }}
                />
                <ul>
                  <li>{contest.yesOption?.label || 'Yes'}</li>
                  <li>{contest.noOption?.label || 'No'}</li>
                </ul>
              </React.Fragment>
            ) : null}
            {contest.type === 'ms-either-neither' ? (
              <React.Fragment>
                <Text
                  preLine
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(contest.description),
                  }}
                />
                <Text>{contest.eitherNeitherLabel}</Text>
                <ul>
                  <li>{contest.eitherOption.label}</li>
                  <li>{contest.neitherOption.label}</li>
                </ul>
                <Text>{contest.pickOneLabel}</Text>
                <ul>
                  <li>{contest.firstOption.label}</li>
                  <li>{contest.secondOption.label}</li>
                </ul>
              </React.Fragment>
            ) : null}
          </React.Fragment>
        ))}
        <HorizontalRule />
      </NavigationScreen>
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        electionHash={electionHash}
        isLiveMode={isLiveMode}
        isAbsenteeMode={isAbsenteeMode}
        precinctId={precinctId}
        locales={locales}
      />
    </React.Fragment>
  )
}

export default BallotScreen
