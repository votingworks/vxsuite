import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { assert } from '@votingworks/basics';
import { SignedHashValidationQrCodeValue } from '@votingworks/types';

import { DateTime } from 'luxon';
import { Button } from './button';
import { Icons } from './icons';
import { Modal } from './modal';
import { QrCode } from './qrcode';
import { Caption, Font, P } from './typography';

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

const SystemHashChunk = styled.pre`
  margin: 0;
`;

export interface SignedHashValidationApiClient {
  generateSignedHashValidationQrCodeValue: () => Promise<SignedHashValidationQrCodeValue>;
}

interface SignedHashValidationModalProps {
  apiClient: SignedHashValidationApiClient;
  onClose: () => void;
}

function SignedHashValidationModal({
  apiClient,
  onClose,
}: SignedHashValidationModalProps): JSX.Element | null {
  const query = useQuery(
    ['generateSignedHashValidationQrCodeValue'],
    () => apiClient.generateSignedHashValidationQrCodeValue(),
    { cacheTime: 0 } // Always generate a fresh QR code value
  );

  if (query.isLoading) {
    return (
      <Modal
        title="Signed Hash Validation"
        content={
          <P>
            <Icons.Loading /> Hashing system state and signing the hash...
          </P>
        }
        actions={<Button onPress={onClose}>Cancel</Button>}
        onOverlayClick={onClose}
      />
    );
  }

  // Our default error handler will take us to a crash page
  /* istanbul ignore next */
  if (!query.isSuccess) {
    return null;
  }
  const { qrCodeValue, qrCodeInputs } = query.data;
  const { combinedElectionHash, date, machineId, softwareVersion, systemHash } =
    qrCodeInputs;

  assert(
    systemHash.length === 44,
    `Expected system hash to be a 44-character base64 string but got ${systemHash}`
  );
  const [systemHashChunk1, systemHashChunk2] = [
    systemHash.slice(0, 22),
    systemHash.slice(22),
  ];

  const dateTime = DateTime.fromJSDate(date);

  return (
    <Modal
      title="Signed Hash Validation"
      content={
        <React.Fragment>
          <P>
            Scan this QR code at{' '}
            <Font weight="semiBold">https://check.voting.works</Font>
          </P>
          <Content>
            <QrCodeContainer>
              <QrCode value={qrCodeValue} />
            </QrCodeContainer>
            <Details>
              <Caption>
                <strong>System Hash:</strong>
                <SystemHashChunk>{systemHashChunk1}</SystemHashChunk>
                <SystemHashChunk>{systemHashChunk2}</SystemHashChunk>
              </Caption>
              <Caption>
                <strong>Version:</strong> {softwareVersion}
              </Caption>
              <Caption>
                <strong>Machine ID:</strong> {machineId}
              </Caption>
              <Caption>
                <strong>Election ID:</strong> {combinedElectionHash || 'None'}
              </Caption>
              <Caption>
                <strong>Date:</strong>{' '}
                {dateTime.toLocaleString(DateTime.DATE_SHORT)}
              </Caption>
              <Caption>
                <strong>Time:</strong>{' '}
                {dateTime.toLocaleString(DateTime.TIME_WITH_SECONDS)}
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
  apiClient: SignedHashValidationApiClient;
}

export function SignedHashValidationButton({ apiClient }: Props): JSX.Element {
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
      <Button onPress={openSignedHashValidationModal}>
        Signed Hash Validation
      </Button>
      {isSignedHashValidationModalOpen && (
        <SignedHashValidationModal
          apiClient={apiClient}
          onClose={closeSignedHashValidationModal}
        />
      )}
    </React.Fragment>
  );
}
