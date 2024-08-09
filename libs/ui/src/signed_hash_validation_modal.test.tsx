import { render } from '../test/react_testing_library';
import { SignedHashValidationModal } from './signed_hash_validation_modal';

test('SignedHashValidationModal renders', () => {
  render(
    <SignedHashValidationModal
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
