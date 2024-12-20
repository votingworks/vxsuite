import { Meta, StoryFn } from '@storybook/react';

import styled from 'styled-components';
import { QrCode, QrCodeProps } from './qrcode';

const initialProps: QrCodeProps = {
  value: 'https://youtu.be/dQw4w9WgXcQ',
};

const QrCodeContainer = styled.div`
  max-width: 75%;
`;

const meta: Meta<typeof QrCode> = {
  title: 'libs-ui/QrCode',
  component: QrCode,
  args: initialProps,
  decorators: [
    (StoryComponent: StoryFn): JSX.Element => (
      <QrCodeContainer>
        <StoryComponent />
      </QrCodeContainer>
    ),
  ],
};

export default meta;

export { QrCode };
