import React, { useCallback, useContext, useRef, useState } from 'react'
import { useParams, useHistory } from 'react-router-dom'
import styled from 'styled-components'
import {
  getBallotStyle,
  getContests,
  getPrecinctById,
  getElectionLocales,
} from '@votingworks/types'
import pluralize from 'pluralize'

import {
  BallotScreenProps,
  BallotLocale,
  InputEventFunction,
  PrintableBallotType,
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
import { getBallotLayoutPageSize } from '../utils/getBallotLayoutPageSize'
import saveAsPDF from '../utils/saveAsPDF'

const BallotCopiesInput = styled(TextInput)`
  width: 4em;
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    opacity: 1;
  }
`

const BallotPreviewHeader = styled.div`
  margin-top: 1rem;
  overflow: auto;
  h4 {
    float: left;
    margin: 0;
    width: 8.5in;
    &:first-child {
      margin-right: 1rem;
    }
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
    &:nth-child(odd) {
      clear: left;
    }
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

  const [ballotPages, setBallotPages] = useState(0)
  const [isLiveMode, setIsLiveMode] = useState(true)
  const toggleLiveMode = () => setIsLiveMode((m) => !m)
  const [isAbsentee, setIsAbsentee] = useState(true)
  const toggleIsAbsentee = () => setIsAbsentee((m) => !m)
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
    isAbsentee,
  })

  const afterPrint = (numCopies: number) => {
    if (isLiveMode) {
      addPrintedBallot({
        ballotStyleId,
        precinctId,
        locales,
        numCopies,
        printedAt: new Date().toISOString(),
        type: isAbsentee
          ? PrintableBallotType.Absentee
          : PrintableBallotType.Precinct,
      })
    }
  }

  const onRendered = () => {
    if (ballotPreviewRef?.current && printBallotRef?.current) {
      ballotPreviewRef.current.innerHTML = printBallotRef.current.innerHTML
    }
    const pagedJsPageCount = Number(
      (ballotPreviewRef.current?.getElementsByClassName(
        'pagedjs_pages'
      )[0] as HTMLElement)?.style.getPropertyValue('--pagedjs-page-count') || 0
    )
    setBallotPages(pagedJsPageCount)
  }

  const handleSaveAsPDF = useCallback(async () => {
    const ballotPath = getBallotPath({
      ballotStyleId,
      election,
      electionHash,
      precinctId,
      locales,
      isLiveMode,
      isAbsentee,
    })
    const succeeded = await saveAsPDF(ballotPath)
    if (!succeeded) {
      // eslint-disable-next-line no-alert
      window.alert(
        'Could not save PDF, it can only be saved to a USB device. (Or if "Cancel" was selected, ignore this message.)'
      )
    }
  }, [])

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
              <Button disabled={isAbsentee} onPress={toggleIsAbsentee} small>
                Absentee
              </Button>
              <Button disabled={!isAbsentee} onPress={toggleIsAbsentee} small>
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
              confirmModal={{
                content: (
                  <div>
                    Is the printer loaded with{' '}
                    <strong>
                      {isAbsentee ? 'Absentee' : 'Precinct'} Ballot
                    </strong>{' '}
                    paper?
                  </div>
                ),
                confirmButtonLabel: 'Yes, Print',
              }}
              copies={ballotCopies}
              warning={!isLiveMode}
            >
              Print {ballotCopies}{' '}
              {isLiveMode ? 'Official' : <strong>Test</strong>}{' '}
              {isAbsentee ? <strong>Absentee</strong> : 'Precinct'}{' '}
              {pluralize('Ballot', ballotCopies)}{' '}
              {availableLocaleCodes.length > 1 &&
                currentLocaleCode &&
                ` in ${getHumanBallotLanguageFormat(locales)}`}
            </PrintButton>
            {window.kiosk && (
              <React.Fragment>
                {' '}
                <Button onPress={handleSaveAsPDF} disabled={ballotPages === 0}>
                  Save Ballot as PDF
                </Button>
              </React.Fragment>
            )}
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
          {ballotPages > 0 && (
            <p>
              This ballot is <strong>{ballotPages} pages</strong> (printed front
              and back) on{' '}
              <strong>{pluralize('sheets', ballotPages / 2, true)}</strong> of{' '}
              <strong>{getBallotLayoutPageSize(election)}-size</strong> paper.
            </p>
          )}
        </Prose>
        <BallotPreviewHeader>
          <h4>Front Pages</h4>
          <h4>Back Pages</h4>
        </BallotPreviewHeader>
        <BallotPreview ref={ballotPreviewRef}>
          <p>Rendering ballot preview…</p>
        </BallotPreview>
      </NavigationScreen>
      <HandMarkedPaperBallot
        ballotStyleId={ballotStyleId}
        election={election}
        electionHash={electionHash}
        isLiveMode={isLiveMode}
        isAbsentee={isAbsentee}
        precinctId={precinctId}
        locales={locales}
        onRendered={onRendered}
      />
    </React.Fragment>
  )
}

export default BallotScreen
