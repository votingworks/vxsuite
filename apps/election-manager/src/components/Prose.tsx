import styled from 'styled-components'

interface Props {
  compact?: boolean
  density?: number
  maxWidth?: boolean
  textCenter?: boolean
}

const Prose = styled('div')<Props>`
  margin: ${({ textCenter }) => (textCenter ? 'auto' : undefined)};

  /* width: 100%; */
  max-width: ${({ maxWidth = true }) => (maxWidth ? '66ch' : undefined)};
  text-align: ${({ textCenter }) => (textCenter ? 'center' : undefined)};
  line-height: ${({ density }) => (density !== 0 ? '1.1' : '1.3')};
  & h1 {
    margin: 2em 0 1em;
    line-height: 1.1;
    font-size: 1.5em;
  }
  & h2 {
    margin: 1.5em 0 0.75em;
    font-size: 1.25em;
  }
  & h3 {
    font-size: 1.17em;
  }
  & h4 {
    font-size: 1em;
  }
  & h5 {
    font-size: 0.9em;
  }
  & h3,
  & h4,
  & h5,
  & p,
  & hr {
    margin-top: ${({ compact, density }) =>
      compact
        ? '0'
        : density === 2
        ? '0.25em'
        : density === 1
        ? '0.5em'
        : '1em'};
    margin-bottom: ${({ compact, density }) =>
      compact
        ? '0'
        : density === 2
        ? '0.25em'
        : density === 1
        ? '0.5em'
        : '1em'};
  }
  & h1 + h2 {
    margin-top: -0.75em;
  }
  & h1 + p,
  & h2 + p {
    margin-top: -0.75em;
  }
  & h3 + p,
  & h4 + p,
  & h5 + p {
    margin-top: ${({ compact, density }) =>
      compact
        ? 0
        : density === 2
        ? '-0.5em'
        : density === 1
        ? '-0.75em'
        : '-1em'};
  }
  & > :not(.ignore-prose):first-child {
    margin-top: 0;
  }
  & > :not(.ignore-prose):last-child {
    margin-bottom: 0;
  }
  & dl {
    margin: 1em 0;
  }
  & hr {
    border: 0;
    border-top: 0.1em solid #000000;
  }
`

export default Prose
