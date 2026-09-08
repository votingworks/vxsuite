import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import { PrintingBallotImage } from './printing_ballot_image.js';

const meta: Meta<typeof PrintingBallotImage> = {
  title: 'libs-ui/Images',
  component: PrintingBallotImage,
};

export default meta;

export { PrintingBallotImage };
