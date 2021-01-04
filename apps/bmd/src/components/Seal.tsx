import React from 'react'
import styled from 'styled-components'

const sealMaxWidth = '250px'

const SealContainer = styled.div`
  max-width: ${sealMaxWidth};
`

const SealImage = styled.img`
  max-width: ${sealMaxWidth};
`

interface Props {
  seal?: string
  sealURL?: string
}

const Seal: React.FC<Props> = ({ seal, sealURL }) => {
  return (
    <SealContainer
      aria-hidden
      dangerouslySetInnerHTML={seal ? { __html: seal } : undefined}
    >
      {(!seal && sealURL && <SealImage alt="state seal" src={sealURL} />) ||
        undefined}
    </SealContainer>
  )
}

export default Seal
