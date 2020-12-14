import { Rect } from '../types'

import { h } from 'preact'

export function positioning(rect: Rect): h.JSX.CSSProperties {
  return {
    position: 'absolute',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  }
}
