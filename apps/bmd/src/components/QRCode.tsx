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

interface Props {
  value: string | Uint8Array
}

const QRCode = ({ value }: Props) => (
  <ResponsiveSvgWrapper>
    <QRCodeReact renderAs="svg" value={value} level="H" />
  </ResponsiveSvgWrapper>
)

export default QRCode
