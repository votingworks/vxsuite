import { Election } from '@votingworks/ballot-encoder'
import React, { useCallback, useContext, useEffect, useState } from 'react'
import HandMarkedPaperBallot from '../components/HandMarkedPaperBallot'
import { MainChild } from '../components/Main'
import { Monospace } from '../components/Text'
import AppContext from '../contexts/AppContext'
import DownloadableArchive from '../utils/DownloadableArchive'
import {
  getBallotFileName,
  getBallotStylesDataByStyle,
  getPrecinctById,
} from '../utils/election'

type State = Init | ArchiveBegin | RenderBallot | ArchiveEnd | Done | Failed

interface Init {
  type: 'Init'
}

interface ArchiveBegin {
  type: 'ArchiveBegin'
  archive: DownloadableArchive
}

interface RenderBallot {
  type: 'RenderBallot'
  archive: DownloadableArchive
  ballotIndex: number
  ballotCount: number
}

interface ArchiveEnd {
  type: 'ArchiveEnd'
  archive: DownloadableArchive
  ballotCount: number
}

interface Done {
  type: 'Done'
  ballotCount: number
}

interface Failed {
  type: 'Failed'
  message: string
}

const ExportElectionBallotPackageScreen = () => {
  const { election: e, electionHash } = useContext(AppContext)
  const election = e as Election
  const ballotStylesDataByStyle = getBallotStylesDataByStyle(election)

  const [state, setState] = useState<State>({ type: 'Init' })

  /**
   * Execute side effects for the current state and, when ready, transition to
   * the next state.
   */
  useEffect(() => {
    ;(async () => {
      switch (state.type) {
        case 'Init': {
          setState({
            type: 'ArchiveBegin',
            archive: new DownloadableArchive(),
          })
          break
        }

        case 'ArchiveBegin': {
          try {
            await state.archive.begin()
            await state.archive.file(
              'election.json',
              JSON.stringify(election, undefined, 2)
            )

            setState({
              type: 'RenderBallot',
              archive: state.archive,
              ballotIndex: 0,
              ballotCount: ballotStylesDataByStyle.length,
            })
          } catch (error) {
            setState({
              type: 'Failed',
              message: error.message,
            })
          }
          break
        }

        case 'ArchiveEnd': {
          await state.archive.end()
          setState({ type: 'Done', ballotCount: state.ballotCount })
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
    await state.archive.file(name, Buffer.from(data))

    if (state.ballotIndex + 1 === state.ballotCount) {
      setState({
        type: 'ArchiveEnd',
        archive: state.archive,
        ballotCount: state.ballotCount,
      })
    } else {
      setState({ ...state, ballotIndex: state.ballotIndex + 1 })
    }
  }, [state, ballotStylesDataByStyle, election, electionHash])

  switch (state.type) {
    case 'Init': {
      return (
        <MainChild>
          <h1>Initializing Download…</h1>
        </MainChild>
      )
    }

    case 'ArchiveBegin': {
      return (
        <MainChild>
          <h1>Downloading</h1>
          <p>Choose where to save the package…</p>
        </MainChild>
      )
    }

    case 'RenderBallot': {
      const { ballotIndex, ballotCount } = state
      const { ballotStyleId, precinctId, contestIds } = ballotStylesDataByStyle[
        ballotIndex
      ]
      const precinctName = getPrecinctById({ election, precinctId })!.name

      return (
        <MainChild>
          <h1>
            Generating Ballot {ballotIndex + 1} of {ballotCount}
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
          />
        </MainChild>
      )
    }

    case 'ArchiveEnd': {
      return (
        <MainChild>
          <h1>Finishing Download</h1>
          <p>Rendered {state.ballotCount} ballot(s), closing zip file.</p>
        </MainChild>
      )
    }

    case 'Done': {
      return (
        <MainChild>
          <h1>Download Complete</h1>
          <p>Rendered {state.ballotCount} ballot(s).</p>
        </MainChild>
      )
    }

    case 'Failed': {
      return (
        <MainChild>
          <h1>Download Failed</h1>
          <p>An error occurred: {state.message}.</p>
        </MainChild>
      )
    }
  }

  // @ts-ignore
  return <MainChild>Unknown State: {state.type}</MainChild>
}

export default ExportElectionBallotPackageScreen
