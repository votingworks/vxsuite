import { render } from '../test/react_testing_library';

import { QrCode } from './qrcode';

it('renders QRCode', () => {
  render(<QrCode value="VX.21.5" />);
});
