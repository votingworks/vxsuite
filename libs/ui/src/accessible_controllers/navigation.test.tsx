import styled from 'styled-components';
import { act, render, screen } from '../../test/react_testing_library';
import {
  PageNavigationButtonId,
  advanceElementFocus,
  triggerPageNavigationButton,
} from './navigation';

const TestButton = styled.button.attrs({ type: 'button' })`
  /* stylelint-disable no-empty-source */
`;

test('advanceElementFocus', () => {
  render(
    <div>
      <TestButton data-testid="focusableButton" />
      <TestButton data-testid="disabledButton" disabled />
      <TestButton data-testid="nonFocusableButton" tabIndex={-1} />
      <TestButton data-testid="hiddenButton" aria-hidden />
      <div data-testid="focusableButtonDiv" role="button" tabIndex={0} />
      <div data-testid="nonFocusableButtonDiv" role="button" tabIndex={-1} />
      <div data-testid="hiddenButtonDiv" role="button" aria-hidden />
      <div aria-hidden>
        <TestButton data-testid="focusableButtonInHiddenBlock" />
        <div
          data-testid="focusableButtonDivInHiddenBlock"
          role="button"
          tabIndex={0}
        />
      </div>
    </div>
  );

  // Expect to move forwards and wrap to beginning:
  act(() => advanceElementFocus(1));
  expect(screen.getByTestId('focusableButton')).toHaveFocus();

  act(() => advanceElementFocus(1));
  expect(screen.getByTestId('focusableButtonDiv')).toHaveFocus();

  act(() => advanceElementFocus(1));
  expect(screen.getByTestId('focusableButton')).toHaveFocus();

  // Expect to move backwards and wrap to end:
  act(() => advanceElementFocus(-1));
  expect(screen.getByTestId('focusableButtonDiv')).toHaveFocus();

  act(() => advanceElementFocus(-1));
  expect(screen.getByTestId('focusableButton')).toHaveFocus();

  act(() => advanceElementFocus(-1));
  expect(screen.getByTestId('focusableButtonDiv')).toHaveFocus();
});

test('advanceElementFocus - is no-op when no focusable elements present', () => {
  render(
    <div>
      <div>foo</div>
    </div>
  );

  expect(() => advanceElementFocus(1)).not.toThrow();
  expect(() => advanceElementFocus(-1)).not.toThrow();
});

test('triggerPageNavigationButton - triggers nav buttons', () => {
  const onClickPrev = jest.fn();
  const onClickNext = jest.fn();

  render(
    <div>
      <TestButton id={PageNavigationButtonId.PREVIOUS} onClick={onClickPrev} />
      <TestButton id={PageNavigationButtonId.NEXT} onClick={onClickNext} />
    </div>
  );

  act(() => triggerPageNavigationButton(PageNavigationButtonId.NEXT));
  expect(onClickPrev).not.toHaveBeenCalled();
  expect(onClickNext).toHaveBeenCalledTimes(1);

  act(() => triggerPageNavigationButton(PageNavigationButtonId.PREVIOUS));
  expect(onClickPrev).toHaveBeenCalledTimes(1);
  expect(onClickNext).toHaveBeenCalledTimes(1);
});

test('triggerPageNavigationButton - is no-op for hidden nav buttons', () => {
  const onClickPrev = jest.fn();
  const onClickNext = jest.fn();

  render(
    <div aria-hidden>
      <TestButton id={PageNavigationButtonId.PREVIOUS} onClick={onClickPrev} />
      <TestButton id={PageNavigationButtonId.NEXT} onClick={onClickNext} />
    </div>
  );

  act(() => triggerPageNavigationButton(PageNavigationButtonId.NEXT));
  act(() => triggerPageNavigationButton(PageNavigationButtonId.PREVIOUS));
  expect(onClickPrev).not.toHaveBeenCalled();
  expect(onClickNext).not.toHaveBeenCalled();
});

test('triggerPageNavigationButton - is no-op for missing nav buttons', () => {
  render(<div>Empty Page</div>);

  expect(() =>
    triggerPageNavigationButton(PageNavigationButtonId.NEXT)
  ).not.toThrow();

  expect(() =>
    triggerPageNavigationButton(
      PageNavigationButtonId.NEXT,
      PageNavigationButtonId.NEXT_AFTER_CONFIRM
    )
  ).not.toThrow();

  expect(() =>
    triggerPageNavigationButton(PageNavigationButtonId.PREVIOUS)
  ).not.toThrow();
});

test('triggerPageNavigationButton - click visible button where there are both visible and hidden options', () => {
  const onClickNextHidden = jest.fn();
  const onClickNextVisible = jest.fn();

  render(
    <div>
      <div aria-hidden>
        <TestButton
          id={PageNavigationButtonId.NEXT}
          onClick={onClickNextHidden}
        />
      </div>
      <div>
        <TestButton
          id={PageNavigationButtonId.NEXT}
          onClick={onClickNextVisible}
        />
      </div>
    </div>
  );

  act(() => triggerPageNavigationButton(PageNavigationButtonId.NEXT));
  expect(onClickNextHidden).not.toHaveBeenCalled();
  expect(onClickNextVisible).toHaveBeenCalled();
});

test('triggerPageNavigationButton - selects the first when there are multiple visible buttons', () => {
  const onClickNext1 = jest.fn();
  const onClickNext2 = jest.fn();

  render(
    <div>
      <TestButton id={PageNavigationButtonId.NEXT} onClick={onClickNext1} />
      <TestButton id={PageNavigationButtonId.NEXT} onClick={onClickNext2} />
    </div>
  );

  act(() => triggerPageNavigationButton(PageNavigationButtonId.NEXT));
  expect(onClickNext1).toHaveBeenCalled();
  expect(onClickNext2).not.toHaveBeenCalled();
});

test('triggerPageNavigationButton - focuses on navigationOnConfirm element when no visible nav buttons', () => {
  const onClickNext = jest.fn();

  render(
    <div>
      <TestButton
        data-testid="button"
        id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
        onClick={onClickNext}
      />
    </div>
  );

  act(() =>
    triggerPageNavigationButton(
      PageNavigationButtonId.NEXT,
      PageNavigationButtonId.NEXT_AFTER_CONFIRM
    )
  );
  // Check that we have focused but not clicked the button
  expect(onClickNext).not.toHaveBeenCalled();
  expect(screen.getByTestId('button')).toHaveFocus();
});

test('triggerPageNavigationButton - does not focus on navigationOnConfirm element id not provided', () => {
  const onClickNext = jest.fn();

  render(
    <div>
      <TestButton
        data-testid="button"
        id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
        onClick={onClickNext}
      />
    </div>
  );

  act(() => triggerPageNavigationButton(PageNavigationButtonId.NEXT));
  // Check that we have focused but not clicked the button
  expect(onClickNext).not.toHaveBeenCalled();
  expect(screen.getByTestId('button')).not.toHaveFocus();
});

test('triggerPageNavigationButton - clicking on a button takes precendence over focus when there are buttons matching both options', () => {
  const onClickNext1 = jest.fn();
  const onClickNext2 = jest.fn();

  render(
    <div>
      <TestButton
        data-testid="button"
        id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
        onClick={onClickNext1}
      />
      <TestButton id={PageNavigationButtonId.NEXT} onClick={onClickNext2} />
    </div>
  );

  act(() =>
    triggerPageNavigationButton(
      PageNavigationButtonId.NEXT,
      PageNavigationButtonId.NEXT_AFTER_CONFIRM
    )
  );
  // Check that we have focused but not clicked the button
  expect(onClickNext1).not.toHaveBeenCalled();
  expect(screen.getByTestId('button')).not.toHaveFocus();
  expect(onClickNext2).toHaveBeenCalled();
});
