import React from 'react';
import styled from 'styled-components';

export const Graphic = styled.img`
  margin: 0 auto 1rem;
  width: 250px;
`;

const UsbImageStyles = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export function UsbImage(): JSX.Element {
  return <UsbImageStyles src="/assets/usb-drive.svg" alt="Insert USB Image" />;
}

export function IndeterminateProgressBar(): JSX.Element {
  return (
    <Graphic
      src="/assets/indeterminate-progress-bar.svg"
      alt="indeterminate-progress-bar"
      aria-hidden
      style={{ width: '400px' }}
    />
  );
}
