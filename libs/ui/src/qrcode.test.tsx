import { expect, test } from 'vitest';
import { render } from '../test/react_testing_library';

import { QrCode } from './qrcode';

test('renders QRCode', () => {
  const { container } = render(<QrCode value="VX.21.5" />);
  expect(container.firstChild).toMatchSnapshot();
});
