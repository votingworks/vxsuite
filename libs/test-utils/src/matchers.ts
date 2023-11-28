export function buttonPressEventMatcher():
  | React.TouchEvent<HTMLButtonElement>
  | React.MouseEvent<HTMLButtonElement> {
  return expect.objectContaining({ detail: expect.any(Number) });
}
