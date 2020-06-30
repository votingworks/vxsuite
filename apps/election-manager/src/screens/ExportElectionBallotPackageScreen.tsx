import React, { useCallback, useContext, useEffect, useState } from 'react'
import pluralize from 'pluralize'
import { getElectionLocales } from '@votingworks/ballot-encoder'

import { DEFAULT_LOCALE } from '../config/globals'
import {
  getBallotFileName,
  getBallotStylesDataByStyle,
  getPrecinctById,
  getHumanBallotLanguageFormat,
} from '../utils/election'

import AppContext from '../contexts/AppContext'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'
import NavigationScreen from '../components/NavigationScreen'
import { Monospace } from '../components/Text'

import * as workflow from '../workflows/ExportElectionBallotPackageWorkflow'

const ExportElectionBallotPackageScreen = () => {
  const { election: e, electionHash } = useContext(AppContext)
  const election = e!
  const ballotStylesDataByStyle = getBallotStylesDataByStyle(election)
  const electionLocaleCodes = getElectionLocales(election, DEFAULT_LOCALE)

  const [state, setState] = useState<workflow.State>(workflow.init(election))

  /**
   * Execute side effects for the current state and, when ready, transition to
   * the next state.
   */
  useEffect(() => {
    ;(async () => {
      switch (state.type) {
        case 'Init': {
          setState(workflow.next)
          break
        }

        case 'ArchiveBegin': {
          try {
            await state.archive.begin()
            await state.archive.file(
              'election.json',
              JSON.stringify(election, undefined, 2)
            )

            setState(workflow.next)
          } catch (error) {
            setState(workflow.error(state, error))
          }
          break
        }

        case 'ArchiveEnd': {
          await state.archive.end()
          setState(workflow.next)
        }
      }
    })()
  }, [state, election])

  /**
   * Callback from `HandMarkedPaperBallot` to let us know the preview has been
   * rendered. Once this happens, we generate a PDF and move on to the next one
   * or finish up if that was the last one.
   */
  const onRendered = useCallback(async () => {
    if (state.type !== 'RenderBallot') {
      throw new Error(
        `unexpected state '${state.type}' found during onRendered callback`
      )
    }

    const { ballotStyleId, precinctId } = ballotStylesDataByStyle[
      state.ballotIndex
    ]
    const fileName = getBallotFileName({
      ballotStyleId,
      election,
      electionHash,
      precinctId,
      localeCode: electionLocaleCodes[state.localeCodeIndex],
    })
    const data = await kiosk!.printToPDF()
    const path = `${state.isLiveMode ? 'live' : 'test'}/${fileName}`
    await state.archive.file(path, Buffer.from(data))
    setState(workflow.next)
  }, [
    ballotStylesDataByStyle,
    election,
    electionHash,
    electionLocaleCodes,
    state,
  ])

  switch (state.type) {
    case 'Init': {
      return (
        <NavigationScreen>
          <h1>Initializing Download…</h1>
        </NavigationScreen>
      )
    }

    case 'ArchiveBegin': {
      return (
        <NavigationScreen>
          <h1>Downloading…</h1>
          <p>Choose where to save the package.</p>
        </NavigationScreen>
      )
    }

    case 'RenderBallot': {
      const { ballotIndex, ballotData, isLiveMode, localeCodeIndex } = state
      const { ballotStyleId, precinctId, contestIds } = ballotStylesDataByStyle[
        ballotIndex
      ]
      const precinctName = getPrecinctById({ election, precinctId })!.name
      const localeCode = electionLocaleCodes[localeCodeIndex]
      return (
        <NavigationScreen>
          <h1>
            Generating Ballot {ballotIndex + 1} of {ballotData.length}…
          </h1>
          <ul>
            <li>
              Ballot Style: <strong>{ballotStyleId}</strong>
            </li>
            <li>
              Precinct: <strong>{precinctName}</strong>
            </li>
            <li>
              Contest count: <strong>{contestIds.length}</strong>
            </li>
            <li>
              Language format:{' '}
              <strong>{getHumanBallotLanguageFormat(localeCode)}</strong>
            </li>
            <li>
              Filename:{' '}
              <Monospace>
                {getBallotFileName({
                  ballotStyleId,
                  election,
                  electionHash,
                  precinctId,
                  localeCode,
                })}
              </Monospace>
            </li>
          </ul>
          <HandMarkedPaperBallot
            ballotStyleId={ballotStyleId}
            election={election}
            isLiveMode={isLiveMode}
            precinctId={precinctId}
            onRendered={onRendered}
            secondaryLocaleCode={localeCode}
          />
        </NavigationScreen>
      )
    }

    case 'ArchiveEnd': {
      return (
        <NavigationScreen>
          <h1>Finishing Download…</h1>
          <p>
            Rendered {pluralize('ballot', state.ballotCount, true)} in{' '}
            {pluralize('language format', state.localesCount, true)}, closing
            zip file.
          </p>
        </NavigationScreen>
      )
    }

    case 'Done': {
      return (
        <NavigationScreen>
          <h1>Download Complete</h1>
          <p>
            Rendered {pluralize('ballot', state.ballotCount, true)} in{' '}
            {pluralize('language format', state.localesCount, true)}.
          </p>
        </NavigationScreen>
      )
    }

    case 'Failed': {
      return (
        <NavigationScreen>
          <h1>Download Failed</h1>
          <p>An error occurred: {state.message}.</p>
        </NavigationScreen>
      )
    }
  }

  // @ts-ignore
  return <NavigationScreen>Unknown State: {state.type}</NavigationScreen>
}

export default ExportElectionBallotPackageScreen
