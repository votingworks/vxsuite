import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from '../test/react_testing_library.js';
import { useReorderAnimation } from './use_reorder_animation.js';

const ROW_HEIGHT = 10;
const animate = vi.fn();
const matchMedia = vi.fn();
const originalMatchMedia = window.matchMedia;
const originalOffsetTop = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetTop'
);

beforeEach(() => {
  HTMLElement.prototype.animate = animate;
  matchMedia.mockReturnValue({ matches: false });
  window.matchMedia = matchMedia;
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const siblings = [...(this.parentElement?.children ?? [])];
      return siblings.indexOf(this) * ROW_HEIGHT;
    },
  });
});

afterEach(() => {
  animate.mockReset();
  matchMedia.mockReset();
  window.matchMedia = originalMatchMedia;
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  if (originalOffsetTop) {
    Object.defineProperty(
      HTMLElement.prototype,
      'offsetTop',
      originalOffsetTop
    );
  }
});

function List({
  ids,
  enabled,
}: {
  ids: string[];
  enabled?: boolean;
}): JSX.Element {
  const ref = useReorderAnimation(ids, enabled);
  return (
    <ul ref={ref}>
      {ids.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}

test('slides moved children from their previous positions', () => {
  const { rerender, getByText } = render(<List ids={['a', 'b', 'c']} />);
  rerender(<List ids={['a', 'b', 'c']} />);
  expect(animate).not.toHaveBeenCalled();

  rerender(<List ids={['b', 'a', 'c', 'd']} />);
  expect(animate.mock.contexts).toEqual([getByText('b'), getByText('a')]);
  expect(animate.mock.calls).toEqual([
    [
      [{ transform: 'translateY(10px)' }, { transform: 'none' }],
      { duration: 200, easing: 'ease-out' },
    ],
    [
      [{ transform: 'translateY(-10px)' }, { transform: 'none' }],
      { duration: 200, easing: 'ease-out' },
    ],
  ]);
});

test('does not animate order changes while disabled', () => {
  const { rerender } = render(<List ids={['a', 'b']} enabled={false} />);
  rerender(<List ids={['b', 'a']} enabled={false} />);
  expect(animate).not.toHaveBeenCalled();
});

test('does not animate when the user prefers reduced motion', () => {
  matchMedia.mockReturnValue({ matches: true });
  const { rerender, getByText } = render(<List ids={['a', 'b', 'c']} />);
  rerender(<List ids={['b', 'a', 'c']} />);
  expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  expect(animate).not.toHaveBeenCalled();

  matchMedia.mockReturnValue({ matches: false });
  rerender(<List ids={['b', 'c', 'a']} />);
  expect(animate.mock.contexts).toEqual([getByText('c'), getByText('a')]);
});
