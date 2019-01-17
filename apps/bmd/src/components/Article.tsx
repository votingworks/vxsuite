import React from 'react'
import styled from 'styled-components'

const Article = styled.article`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  margin: 2rem;
  @media print {
    justify-content: flex-start;
    margin: 0;
  }
`

const StyledArticle = ({ children }: { children: React.ReactNode }) => (
  <Article>{children}</Article>
)

export default StyledArticle
