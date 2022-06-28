import React, { useContext, useEffect, useState } from 'react';

import {
  Button,
  Prose,
  Modal,
  QrCode,
  isAdminAuth,
  isPollworkerAuth,
} from '@votingworks/ui';

import { assert } from '@votingworks/utils';

import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';

const QrCodeWrapper = styled.div`
  margin: auto;
  width: 512px;
`;

export interface Props {
  onClose: () => void;
}

export function LiveCheckModal({ onClose }: Props): JSX.Element {
  const [livecheckUrl, setLivecheckUrl] = useState('');
  const { electionDefinition, machineConfig, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(machineConfig);
  assert(isAdminAuth(auth) || isPollworkerAuth(auth));

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
      actions={
        <React.Fragment>
          <Button onPress={onClose}>Done</Button>
        </React.Fragment>
      }
    />
  );
}
