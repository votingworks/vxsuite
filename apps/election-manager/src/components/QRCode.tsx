import QRCodeReact from '@votingworks/qrcode.react'
import React from 'react'
import styled from 'styled-components'

const ResponsiveSvgWrapper = styled.div`
  & > svg {
    display: block; /* svg is "inline" by default */
    width: 100%; /* reset width */
    height: auto; /* reset height */
  }
`

interface QRCodeProps {
  value: string | Uint8Array
  size?: number
  bgColor?: string
  fgColor?: string
  level?: 'L' | 'M' | 'Q' | 'H'
  renderAs?: 'svg' | 'canvas'
}

const QRCode = ({ level = 'H', renderAs = 'svg', value }: QRCodeProps) => (
  <ResponsiveSvgWrapper>
    <QRCodeReact renderAs={renderAs} value={value} level={level} />
  </ResponsiveSvgWrapper>
)

export default QRCode
