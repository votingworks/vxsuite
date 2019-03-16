import styled from 'styled-components'

interface Props {
  textCenter?: boolean
}

const Prose = styled('div')<Props>`
  line-height: 1.2;
  max-width: 66ch;
  text-align: ${({ textCenter }) => (textCenter ? 'center' : undefined)};
  margin: ${({ textCenter }) => (textCenter ? 'auto' : undefined)};
  @media (min-width: 480px) {
    line-height: 1.3;
  }
  & h1 {
    line-height: 1.1;
    margin: 2rem 0 1rem;
  }
  & h2 {
    margin: 1.5rem 0 1rem;
  }
  & h3,
  & p {
    margin: 1rem 0;
  }
  & h1 + h2 {
    margin-top: -0.75rem;
  }
  & h1 + p,
  & h2 + p,
  & h3 + p {
    margin-top: -0.75rem;
  }
  & :first-child {
    margin-top: 0;
  }
  & :last-child {
    margin-bottom: 0;
  }
`

export default Prose
