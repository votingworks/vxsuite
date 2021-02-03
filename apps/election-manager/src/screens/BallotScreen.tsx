import React, { useContext, useRef, useState } from 'react'
import { useParams, useHistory } from 'react-router-dom'
import styled from 'styled-components'
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
import { Monospace } from '../components/Text'
import { getBallotPath, getHumanBallotLanguageFormat } from '../utils/election'
import NavigationScreen from '../components/NavigationScreen'
import { DEFAULT_LOCALE } from '../config/globals'
import routerPaths from '../routerPaths'
import TextInput from '../components/TextInput'
import LinkButton from '../components/LinkButton'
import Prose from '../components/Prose'

const BallotCopiesInput = styled(TextInput)`
  width: 4em;
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    opacity: 1;
  }
`

const BallotPreview = styled.div`
  border-width: 1px 0;
  overflow: auto;
  /* stylelint-disable-next-line selector-class-pattern */
  & .pagedjs_page {
    float: left;
    margin: 1rem 1rem 0 0;
    background: #ffffff;
  }
`

const BallotScreen: React.FC = () => {
  const history = useHistory()
  const ballotPreviewRef = useRef<HTMLDivElement>(null)
  const {
    precinctId,
    ballotStyleId,
    localeCode: currentLocaleCode,
  } = useParams<BallotScreenProps>()
  const { addPrintedBallot, electionDefinition, printBallotRef } = useContext(
    AppContext
  )
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

  const onRendered = () => {
    if (ballotPreviewRef?.current && printBallotRef?.current) {
      ballotPreviewRef.current.innerHTML = printBallotRef.current.innerHTML
    }
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>
            Ballot Style <strong>{ballotStyleId}</strong> for {precinctName} has{' '}
            <strong>{pluralize('contest', ballotContests.length, true)}</strong>
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
              <React.Fragment>
                {' '}
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
                          localeCode === DEFAULT_LOCALE
                            ? undefined
                            : localeCode,
                      })}
                    </Button>
                  ))}
                </SegmentedButton>
              </React.Fragment>
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
            Ballot Package Filename: <Monospace>{filename}</Monospace>
          </p>
          <h3>Ballot Preview</h3>
        </Prose>
        <BallotPreview ref={ballotPreviewRef}>
          <p>Rendering ballot preview…</p>
        </BallotPreview>
      </NavigationScreen>
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        electionHash={electionHash}
        isLiveMode={isLiveMode}
        isAbsenteeMode={isAbsenteeMode}
        precinctId={precinctId}
        locales={locales}
        onRendered={onRendered}
      />
    </React.Fragment>
  )
}

export default BallotScreen
