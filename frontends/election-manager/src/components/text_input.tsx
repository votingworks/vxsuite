import styled from 'styled-components';

interface Props {
  disabled?: boolean;
}

export const TextInput = styled.input.attrs(({ type = 'text' }) => ({
  type,
}))<Props>`
  display: inline-block;
  border: 1px solid #cccccc;
  background: ${({ disabled = false }) => (disabled ? '#dddddd' : '#ffffff')};
  width: 100%;
  padding: 0.35rem 0.5rem;
  line-height: 1.25;
`;

export const InlineForm = styled.div`
  display: flex;
  flex-direction: row;
  input[type='text'] {
    flex: 1;
    border-radius: 0.25em;
  }
  & > button:not(:last-child),
  & > input[type='text']:not(:last-child) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  & > button:not(:first-child),
  & > input[type='text']:not(:first-child) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
`;
