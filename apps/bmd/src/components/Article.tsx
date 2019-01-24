import styled from 'styled-components'

const Article = styled.article`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  margin: 1rem;
  @media print {
    justify-content: flex-start;
    margin: 0;
  }
`

export default Article
