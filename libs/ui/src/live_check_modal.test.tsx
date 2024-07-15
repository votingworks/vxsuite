import { render } from '../test/react_testing_library';
import { LiveCheckModal } from './live_check_modal';

test('LiveCheckModal renders', () => {
  render(
    <LiveCheckModal
      onClose={jest.fn()}
      qrCodeValue="qrCodeValue"
      signatureInputs={{
        machineId: 'machineId',
        date: new Date(),
        ballotHashPrefix: 'ballotHashPrefix',
      }}
    />
  );
});
