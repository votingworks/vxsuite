import { BallotTargetMark, Point, Rect } from '@votingworks/hmpb-interpreter'
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import styled from 'styled-components'
import { PageInterpretation, ReviewBallot } from '../config/types'
import { Sheet } from './DebugSheetList'

const ScoreContainer = styled.div`
  font-size: 0.5em;
  font-weight: 600;
  text-shadow: 1px 1px 3px #ffffff;
`

const formatScore = (score: number) => {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 2,
  })
  return formatter.format(score)
}

const Score = ({
  score,
  ...rest
}: { score: number } & React.HTMLAttributes<HTMLDivElement>) => {
  return <ScoreContainer {...rest}>{formatScore(score)}</ScoreContainer>
}

const DebugSheet: React.FC = () => {
  const { sheetId, side } = useParams<{
    sheetId: string
    side: 'front' | 'back'
  }>()
  const [interpretation, setInterpretation] = useState<PageInterpretation>()
  const [page, setPage] = useState<ReviewBallot>()

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch(`/scan/sheets/${sheetId}`)
        const results: Sheet[] = await response.json()
        setInterpretation(
          side === 'front'
            ? results[0].frontInterpretation
            : results[0].backInterpretation
        )
      } catch (error) {
        // console.error(error)
      }
    })()
  }, [sheetId, side])

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch(`/scan/hmpb/ballot/${sheetId}/${side}`)
        setPage(await response.json())
      } catch (error) {
        // console.error(error)
      }
    })()
  }, [sheetId, side])

  if (!interpretation) {
    return <h1>Loading…</h1>
  }

  if (
    interpretation.type === 'BlankPage' ||
    interpretation.type === 'InvalidTestModePage' ||
    interpretation.type === 'UnreadablePage' ||
    interpretation.type === 'UninterpretedHmpbPage' ||
    interpretation.type === 'InterpretedBmdPage' ||
    page?.type !== 'ReviewMarginalMarksBallot'
  ) {
    return (
      <React.Fragment>
        <h1>{interpretation.type}</h1>
        <img alt="page" src={page?.ballot.image.url} />
      </React.Fragment>
    )
  }

  const hmpb = interpretation
  const scale = 1

  function translateRect(rect: Rect): Rect {
    return {
      x: rect.x * scale,
      y: rect.y * scale,
      width: rect.width * scale,
      height: rect.height * scale,
    }
  }

  function rectAroundPoint(center: Point, radius: number): Rect {
    return {
      x: center.x - radius,
      y: center.y - radius,
      width: radius * 2 + 1,
      height: radius * 2 + 1,
    }
  }

  type Offset = Point
  function offsetRect(rect: Rect, offset: Offset): Rect {
    return {
      ...rect,
      x: rect.x + offset.x,
      y: rect.y + offset.y,
    }
  }

  function position(rect: Rect): React.CSSProperties {
    return {
      position: 'absolute',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    }
  }

  return (
    <React.Fragment>
      <h1>{hmpb.type}</h1>
      <div style={{ position: 'relative' }}>
        {page.layout.map((contestLayout) => (
          <React.Fragment
            key={`${contestLayout.bounds.x}-${contestLayout.bounds.y}`}
          >
            <div
              style={{
                ...position(translateRect(contestLayout.bounds)),
                backgroundColor: '#00ff0066',
              }}
            />
            {contestLayout.corners.map((corner) => (
              <div
                key={`${corner.x}-${corner.y}`}
                style={{
                  ...position(rectAroundPoint(corner, 5)),
                  backgroundColor: '#ff000099',
                }}
              />
            ))}
          </React.Fragment>
        ))}
        {hmpb.markInfo.marks
          .filter((mark): mark is BallotTargetMark => mark.type !== 'stray')
          .map((mark) => (
            <React.Fragment
              key={`${mark.contest.id}-${
                typeof mark.option === 'string' ? mark.option : mark.option.id
              }`}
            >
              <div
                style={{
                  ...position(translateRect(mark.target.inner)),
                  backgroundColor: '#ff00ff99',
                }}
              />
              <Score
                score={mark.score}
                style={{
                  ...position(
                    translateRect(
                      offsetRect(mark.target.bounds, {
                        x: 0,
                        y: mark.target.bounds.height,
                      })
                    )
                  ),
                }}
              />
            </React.Fragment>
          ))}
        <img
          alt="page"
          src={`/scan/hmpb/ballot/${sheetId}/${side}/image/normalized`}
          width={hmpb.markInfo.ballotSize.width * scale}
          height={hmpb.markInfo.ballotSize.height * scale}
        />
      </div>
    </React.Fragment>
  )
}

export default DebugSheet
