import styled from 'styled-components'

const InputGroup = styled.div`
  display: inline-flex;
  flex-direction: row;
  & > * {
    &:focus {
      z-index: 2;
    }
    &:not(:first-child) {
      margin-left: -1px;
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
    &:not(:last-child) {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
  }
  & > select {
    border: 1px solid #333333;
    background-color: #ffffff;
  }
`

export default InputGroup
