import React, { useState } from 'react';
import {
  Button,
  SignedHashValidationModal as SignedHashValidationModalBase,
} from '@votingworks/ui';

import { generateSignedHashValidationQrCodeValue } from '../api';

interface SignedHashValidationModalProps {
  onClose: () => void;
}

function SignedHashValidationModal({
  onClose,
}: SignedHashValidationModalProps): JSX.Element | null {
  const signedHashValidationQrCodeValueQuery =
    generateSignedHashValidationQrCodeValue.useQuery();

  if (!signedHashValidationQrCodeValueQuery.isSuccess) {
    return null;
  }
  const { qrCodeValue, signatureInputs } =
    signedHashValidationQrCodeValueQuery.data;

  return (
    <SignedHashValidationModalBase
      onClose={onClose}
      qrCodeValue={qrCodeValue}
      signatureInputs={signatureInputs}
    />
  );
}

export function SignedHashValidationButton(): JSX.Element {
  const [isSignedHashValidationModalOpen, setIsSignedHashValidationModalOpen] =
    useState(false);

  function openSignedHashValidationModal() {
    return setIsSignedHashValidationModalOpen(true);
  }

  function closeSignedHashValidationModal() {
    return setIsSignedHashValidationModalOpen(false);
  }

  return (
    <React.Fragment>
      <Button onPress={openSignedHashValidationModal}>Hash Validation</Button>
      {isSignedHashValidationModalOpen && (
        <SignedHashValidationModal onClose={closeSignedHashValidationModal} />
      )}
    </React.Fragment>
  );
}
