
import React, { useCallback, useContext, useEffect, useState } from 'react'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'
import NavigationScreen from '../components/NavigationScreen'
import { Monospace } from '../components/Text'
import AppContext from '../contexts/AppContext'
import {
  getBallotFileName,
  getBallotStylesDataByStyle,
  getPrecinctById,
} from '../utils/election'
import * as workflow from '../workflows/ExportElectionBallotPackageWorkflow'

const ExportElectionBallotPackageScreen = () => {
  const { election: e, electionHash } = useContext(AppContext)
  const election = e!
  const ballotStylesDataByStyle = getBallotStylesDataByStyle(election)

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
  }, [state, election, ballotStylesDataByStyle.length])

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
    const name = getBallotFileName({
      ballotStyleId,
      election,
      electionHash,
      precinctId,
    })
    const data = await kiosk!.printToPDF()
    const path = `${state.isLiveMode ? 'live' : 'test'}/${name}`
    await state.archive.file(path, Buffer.from(data))
    setState(workflow.next)
  }, [state, ballotStylesDataByStyle, election, electionHash])

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
          <h1>Downloading</h1>
          <p>Choose where to save the package…</p>
        </NavigationScreen>
      )
    }

    case 'RenderBallot': {
      const { ballotIndex, ballotData, isLiveMode } = state
      const { ballotStyleId, precinctId, contestIds } = ballotStylesDataByStyle[
        ballotIndex
      ]
      const precinctName = getPrecinctById({ election, precinctId })!.name

      return (
        <NavigationScreen>
          <h1>
            Generating Ballot {ballotIndex + 1} of {ballotData.length}
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
              Filename:{' '}
              <Monospace>
                {getBallotFileName({
                  ballotStyleId,
                  election,
                  electionHash,
                  precinctId,
                })}
              </Monospace>
            </li>
          </ul>
          <HandMarkedPaperBallot
            ballotStyleId={ballotStyleId}
            election={election}
            precinctId={precinctId}
            onRendered={onRendered}
            isLiveMode={isLiveMode}
          />
        </NavigationScreen>
      )
    }

    case 'ArchiveEnd': {
      return (
        <NavigationScreen>
          <h1>Finishing Download</h1>
          <p>Rendered {state.ballotCount} ballot(s), closing zip file.</p>
        </NavigationScreen>
      )
    }

    case 'Done': {
      return (
        <NavigationScreen>
          <h1>Download Complete</h1>
          <p>Rendered {state.ballotCount} ballot(s).</p>
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
