import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import {
  BallotImage,
  HIGHLIGHT_PRIMARY_BACKGROUND,
  HIGHLIGHT_WARNING_BACKGROUND,
} from './ballot_image';

const BALLOT_BOUNDS = { x: 0, y: 0, width: 1700, height: 2200 } as const;
const IMAGE_URL = 'data:image/png;base64,';

test('renders ballot image as background image', () => {
  render(<BallotImage imageUrl={IMAGE_URL} ballotBounds={BALLOT_BOUNDS} />);
  const ballotImage = screen.getByRole('img', { name: /ballot/i });
  expect(ballotImage.style.backgroundImage).toEqual(`url(${IMAGE_URL})`);
  expect(ballotImage.style.aspectRatio).toEqual(
    `${BALLOT_BOUNDS.width} / ${BALLOT_BOUNDS.height}`
  );
});

test('renders no overlays without highlights', () => {
  const { container } = render(
    <BallotImage imageUrl={IMAGE_URL} ballotBounds={BALLOT_BOUNDS} />
  );
  const wrapper = container.querySelector('div')!;
  expect(wrapper.children).toHaveLength(0);
});

test('renders highlight overlays', () => {
  const { container } = render(
    <BallotImage
      imageUrl={IMAGE_URL}
      ballotBounds={BALLOT_BOUNDS}
      highlights={[
        {
          bounds: { x: 170, y: 440, width: 510, height: 660 },
          variant: 'warning',
        },
        {
          bounds: { x: 850, y: 440, width: 510, height: 660 },
          variant: 'primary',
        },
      ]}
    />
  );

  const wrapper = container.querySelector('div')!;
  expect(wrapper.children).toHaveLength(2);

  const warningOverlay = wrapper.children[0] as HTMLElement;
  expect(warningOverlay).toHaveStyle({
    top: '20%',
    left: '10%',
    width: '30%',
    height: '30%',
    background: HIGHLIGHT_WARNING_BACKGROUND,
  });

  const primaryOverlay = wrapper.children[1] as HTMLElement;
  expect(primaryOverlay).toHaveStyle({
    top: '20%',
    left: '50%',
    width: '30%',
    height: '30%',
    background: HIGHLIGHT_PRIMARY_BACKGROUND,
  });
});
