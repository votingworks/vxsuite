import styled from 'styled-components'

const TextInput = styled.input`
  border: 1px solid #333333;
  border-radius: 0.25rem;
  background: #ffffff;
  width: 100%;
  padding: 0.35rem 0.5rem;
  line-height: 1.25;
  &:disabled {
    background: #dddddd;
    color: rgb(170, 170, 170);
  }
  &[type='date'],
  &[type='time'] {
    position: relative;
    padding: 0 1rem;
    text-align: center;
    &::-webkit-datetime-edit {
      display: contents;
    }
    &::-webkit-calendar-picker-indicator {
      position: absolute; /* trigger picker when clicking anywhere in input */
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      margin: 0;
      background-image: none;
      width: 100%;
      height: auto;
      padding: 0;
    }
  }
`

export default TextInput
