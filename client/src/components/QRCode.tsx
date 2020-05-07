import QRCodeReact, { QRCodeProps } from '@votingworks/qrcode.react'
import React from 'react'
import styled from 'styled-components'

const ResponsiveSvgWrapper = styled.div`
  & > svg {
    display: block; /* svg is "inline" by default */
    width: 100%; /* reset width */
    height: auto; /* reset height */
  }
`

const QRCode = ({ level = 'H', renderAs = 'svg', value }: QRCodeProps) => (
  <ResponsiveSvgWrapper>
    <QRCodeReact renderAs={renderAs} value={value} level={level} />
  </ResponsiveSvgWrapper>
)

export default QRCode
