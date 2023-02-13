import React from 'react';
import { render } from '@testing-library/react';

import { QrCode } from './qrcode';

it('renders QRCode', () => {
  const { container } = render(<QrCode value="VX.21.5" />);
  expect(container.firstChild).toMatchSnapshot();
});
