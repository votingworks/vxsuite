import styled from 'styled-components'

interface Props {
  block?: boolean
  disabled?: boolean
  small?: boolean
}

const Select = styled.select<Props>`
  display: ${({ block = true }) => (block ? 'block' : undefined)};
  margin: 0;
  border: 1px solid #bbbbbb;
  border-radius: 0.25rem;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='292.4' height='292.4'%3E%3Cpath fill='%23455a64' d='M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z'/%3E%3C/svg%3E%0A");
  background-position: right 0.7rem top 50%, 0 0;
  background-repeat: no-repeat, repeat;
  background-size: 0.65em auto, 100%;
  cursor: ${({ disabled = false }) => (disabled ? 'not-allowed' : undefined)};
  width: ${({ block = true }) => (block ? '100%' : 'auto')};
  max-width: 100%;
  overflow: show;
  padding: ${({ small = false }) =>
    small ? '0.35rem 2rem 0.35rem 0.5rem' : '0.75rem 1rem 0.75rem 1rem'};
  white-space: nowrap;
  appearance: none;
  &:disabled {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='292.4' height='292.4'%3E%3Cpath fill='%23bbbbbb' d='M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z'/%3E%3C/svg%3E%0A");
  }
`

export default Select
