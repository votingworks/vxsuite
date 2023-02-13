import React, { useEffect, useState } from 'react';
import { Button, Prose, Modal, QrCode } from '@votingworks/shared-frontend';
import styled from 'styled-components';
import { ElectionDefinition } from '@votingworks/types';
import { MachineConfig } from '../config/types';

const QrCodeWrapper = styled.div`
  margin: auto;
  width: 512px;
`;

export interface Props {
  machineConfig: MachineConfig;
  electionDefinition: ElectionDefinition;
  onClose: () => void;
}

export function LiveCheckModal({
  machineConfig,
  electionDefinition,
  onClose,
}: Props): JSX.Element {
  const [livecheckUrl, setLivecheckUrl] = useState('');

  useEffect(() => {
    void (async () => {
      const { machineId } = machineConfig;
      const timestamp = new Date().getTime();
      const stringToSign = `${machineId}|${timestamp}|${electionDefinition.electionHash}`;
      const signature =
        window.kiosk &&
        (await window.kiosk.sign({
          signatureType: 'lc',
          payload: stringToSign,
        }));

      const newUrl = `https://check.voting.works/?m=${encodeURIComponent(
        machineId
      )}&p=${encodeURIComponent(stringToSign)}&s=${encodeURIComponent(
        signature || 'OY'
      )}`;
      setLivecheckUrl(newUrl);
    })();
  }, [setLivecheckUrl, electionDefinition, machineConfig]);

  return (
    <Modal
      content={
        <Prose textCenter>
          <h1>Live Check</h1>
          <QrCodeWrapper>
            <QrCode value={livecheckUrl} />
          </QrCodeWrapper>
        </Prose>
      }
      onOverlayClick={onClose}
      actions={<Button onPress={onClose}>Done</Button>}
    />
  );
}
