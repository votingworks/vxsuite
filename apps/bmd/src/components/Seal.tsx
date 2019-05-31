import React from 'react'
import styled from 'styled-components'

const SealContainer = styled.p`
  margin: 0 auto 1rem;
  max-width: 320px;
`

const SealImage = styled.img`
  max-width: 320px;
`

interface Props {
  seal?: string
  sealURL?: string
}

const Seal = ({ seal, sealURL }: Props) => {
  return (
    <SealContainer
      aria-hidden="true"
      dangerouslySetInnerHTML={seal ? { __html: seal } : undefined}
    >
      {(!seal && sealURL && <SealImage alt="state seal" src={sealURL} />) ||
        undefined}
    </SealContainer>
  )
}

export default Seal
