import React, { useState } from 'react';
import styled from 'styled-components';
import { QueryKey, UseQueryResult } from '@tanstack/react-query';
import { SignedHashValidationQrCodeValue } from '@votingworks/types';

import { Button } from './button';
import { Icons } from './icons';
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

export interface GenerateSignedHashValidationQrCodeValue {
  readonly queryKey: () => QueryKey;
  readonly useQuery: () => UseQueryResult<
    SignedHashValidationQrCodeValue,
    unknown
  >;
}

interface SignedHashValidationModalProps {
  onClose: () => void;
  generateSignedHashValidationQrCodeValue: GenerateSignedHashValidationQrCodeValue;
}

function SignedHashValidationModal({
  onClose,
  generateSignedHashValidationQrCodeValue,
}: SignedHashValidationModalProps): JSX.Element | null {
  const query = generateSignedHashValidationQrCodeValue.useQuery();

  if (query.isLoading) {
    return (
      <Modal
        title="Hash Validation"
        content={
          <P>
            <Icons.Loading /> Hashing executable partition and signing the
            hash...
          </P>
        }
        actions={<Button onPress={onClose}>Cancel</Button>}
        onOverlayClick={onClose}
      />
    );
  }

  // Our default error handler will take us to a crash page
  if (!query.isSuccess) {
    return null;
  }
  const { qrCodeValue, signatureInputs } = query.data;

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
      onOverlayClick={onClose}
    />
  );
}

interface Props {
  generateSignedHashValidationQrCodeValue: GenerateSignedHashValidationQrCodeValue;
}

export function SignedHashValidationButton(props: Props): JSX.Element {
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
        <SignedHashValidationModal
          onClose={closeSignedHashValidationModal}
          {...props}
        />
      )}
    </React.Fragment>
  );
}
