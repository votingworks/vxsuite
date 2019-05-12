import QRCodeReact from 'qrcode.react'
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
  value: string
}

const QRCode = ({ value }: Props) => (
  <ResponsiveSvgWrapper>
    <QRCodeReact renderAs="svg" value={value} level="H" />
  </ResponsiveSvgWrapper>
)

export default QRCode
