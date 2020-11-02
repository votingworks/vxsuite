import styled from 'styled-components'

interface Props {
  compact?: boolean
  maxWidth?: boolean
  textCenter?: boolean
}

const Prose = styled('div')<Props>`
  margin: ${({ textCenter }) => (textCenter ? 'auto' : undefined)};

  /* width: 100%; */
  max-width: ${({ maxWidth = true }) => (maxWidth ? '66ch' : undefined)};
  text-align: ${({ textCenter }) => (textCenter ? 'center' : undefined)};
  line-height: 1.2;
  @media (min-width: 480px) {
    line-height: 1.3;
  }
  & h1 {
    margin: 2rem 0 1rem;
    line-height: 1.1;
    font-size: 1.5rem;
  }
  & h2 {
    margin: 1.5rem 0 0.75rem;
    font-size: 1.25rem;
  }
  & h3 {
    font-size: 1.17rem;
  }
  & h4 {
    font-size: 1rem;
  }
  & h5 {
    font-size: 0.9rem;
  }
  & h3,
  & h4,
  & h5,
  & p {
    margin-top: ${({ compact }) => (compact ? '0' : '1rem')};
    margin-bottom: ${({ compact }) => (compact ? '0' : '1rem')};
  }
  & h1 + h2 {
    margin-top: -0.75rem;
  }
  & h1 + p,
  & h2 + p {
    margin-top: -0.75rem;
  }
  & h3 + p,
  & h4 + p,
  & h5 + p {
    margin-top: ${({ compact }) => (compact ? 0 : '-1rem')};
  }
  & > :first-child {
    margin-top: 0;
  }
  & > :last-child {
    margin-bottom: 0;
  }
  & dl {
    margin: 1rem 0;
  }
`

export default Prose
