import React from 'react';
import styled from 'styled-components';

import { Button } from './button';
import { Modal } from './modal';
import { QrCode } from './qrcode';
import { Caption, P } from './typography';

const Content = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5em;
`;

const QrCodeContainer = styled.div`
  width: 512px;
`;

const Details = styled.div`
  display: flex;
  flex-direction: column;
`;

interface Props {
  onClose: () => void;
  qrCodeValue: string;
  signatureInputs: {
    machineId: string;
    date: Date;
    ballotHashPrefix?: string;
  };
}

export function LiveCheckModal({
  onClose,
  qrCodeValue,
  signatureInputs,
}: Props): JSX.Element | null {
  return (
    <Modal
      title="Hash Validation"
      content={
        <React.Fragment>
          <P>Scan this QR code at https://check.voting.works</P>
          <Content>
            <QrCodeContainer>
              <QrCode value={qrCodeValue} />
            </QrCodeContainer>
            <Details>
              <Caption>
                <strong>Machine ID:</strong> {signatureInputs.machineId}
              </Caption>
              {signatureInputs.ballotHashPrefix && (
                <Caption>
                  <strong>Election ID:</strong>{' '}
                  {signatureInputs.ballotHashPrefix}
                </Caption>
              )}
              <Caption>
                <strong>Date:</strong> {signatureInputs.date.toLocaleString()}
              </Caption>
            </Details>
          </Content>
        </React.Fragment>
      }
      actions={<Button onPress={onClose}>Done</Button>}
      centerContent
      onOverlayClick={onClose}
    />
  );
}
