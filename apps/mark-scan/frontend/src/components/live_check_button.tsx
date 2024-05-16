/* istanbul ignore file */
import React, { useState } from 'react';
import { Button, LiveCheckModal as LiveCheckModalBase } from '@votingworks/ui';

import { generateLiveCheckQrCodeValue } from '../api';

interface LiveCheckModalProps {
  onClose: () => void;
}

function LiveCheckModal({ onClose }: LiveCheckModalProps): JSX.Element | null {
  const liveCheckQrCodeValueQuery = generateLiveCheckQrCodeValue.useQuery();

  if (!liveCheckQrCodeValueQuery.isSuccess) {
    return null;
  }
  const { qrCodeValue, signatureInputs } = liveCheckQrCodeValueQuery.data;

  return (
    <LiveCheckModalBase
      onClose={onClose}
      qrCodeValue={qrCodeValue}
      signatureInputs={signatureInputs}
    />
  );
}

export function LiveCheckButton(): JSX.Element {
  const [isLiveCheckModalOpen, setIsLiveCheckModalOpen] = useState(false);

  function openLiveCheckModal() {
    return setIsLiveCheckModalOpen(true);
  }

  function closeLiveCheckModal() {
    return setIsLiveCheckModalOpen(false);
  }

  return (
    <React.Fragment>
      <Button onPress={openLiveCheckModal}>Hash Validation</Button>
      {isLiveCheckModalOpen && <LiveCheckModal onClose={closeLiveCheckModal} />}
    </React.Fragment>
  );
}
