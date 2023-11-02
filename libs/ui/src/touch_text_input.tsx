import styled, { keyframes } from 'styled-components';

export interface TouchTextInputProps {
  value: string;
}

const Container = styled.div`
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.onBackground};
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  line-height: 0.8;
  padding: 0.35rem 0.3rem;
  width: 100%;
  word-wrap: break-word;
`;

const Value = styled.span`
  vertical-align: middle;
`;

const blinkKeyframes = keyframes`
  to { visibility: hidden }
`;

const Cursor = styled.span`
  animation: ${blinkKeyframes} 1s steps(2, start) infinite;
  border-left: 0.15em solid currentColor;
  display: inline-block;
  height: 1em;
  margin-left: 0.025em;
  vertical-align: middle;
`;

export function TouchTextInput(props: TouchTextInputProps): JSX.Element {
  const { value } = props;

  return (
    <Container>
      <Value>{value}</Value>
      <Cursor />
    </Container>
  );
}
