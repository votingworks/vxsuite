import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import { VerifyBallotImage } from './verify_ballot_image';

const meta: Meta<typeof VerifyBallotImage> = {
  title: 'libs-ui/Images',
  component: VerifyBallotImage,
};

export default meta;

export { VerifyBallotImage };
