import React from 'react';
import styled from 'styled-components';

const UsbImageStyles = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export function UsbImage(): JSX.Element {
  return <UsbImageStyles src="/assets/usb-drive.svg" alt="Insert USB Image" />;
}
