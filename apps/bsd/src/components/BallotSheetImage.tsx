import { Contest, SerializableBallotPageLayout } from '@votingworks/types'
import { zip } from '@votingworks/utils'
import React, { useCallback, useRef, useState } from 'react'

export interface Props {
  imageURL: string
  layout?: SerializableBallotPageLayout
  contestIds?: readonly Contest['id'][]
  styleForContest?(contestId: Contest['id']): React.CSSProperties
}

export default function BallotSheetImage({
  imageURL,
  layout,
  contestIds,
  styleForContest,
}: Props): JSX.Element {
  const imageRef = useRef<HTMLImageElement>(null)

  const [xScaleValue, setXScaleValue] = useState(0)
  const [yScaleValue, setYScaleValue] = useState(0)

  const recalculateScale = useCallback(() => {
    if (!layout || !imageRef.current || imageRef.current.clientWidth === 0) {
      return
    }

    const width = imageRef.current.clientWidth
    const height = imageRef.current.clientHeight
    setXScaleValue(width / layout.ballotImage.imageData.width)
    setYScaleValue(height / layout.ballotImage.imageData.height)
  }, [layout, imageRef.current])

  const scaleX = useCallback(
    (ballotLength: number): number => ballotLength * xScaleValue,
    [xScaleValue]
  )

  const scaleY = useCallback(
    (ballotLength: number): number => ballotLength * yScaleValue,
    [yScaleValue]
  )

  return (
    <div style={{ position: 'relative' }}>
      <img
        ref={imageRef}
        src={imageURL}
        alt="front"
        onLoad={recalculateScale}
      />
      {layout &&
        contestIds &&
        [...zip(layout.contests, contestIds)].map(
          ([contestLayout, contestId]) => (
            <div
              key={contestId}
              style={{
                position: 'absolute',
                left: `${scaleX(contestLayout.bounds.x)}px`,
                top: `${scaleY(contestLayout.bounds.y)}px`,
                width: `${scaleX(contestLayout.bounds.width)}px`,
                height: `${scaleY(contestLayout.bounds.height)}px`,
                ...styleForContest?.(contestId),
              }}
            />
          )
        )}
    </div>
  )
}
