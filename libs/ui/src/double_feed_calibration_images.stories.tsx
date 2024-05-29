import { Meta } from '@storybook/react';

import {
  DoubleFeedCalibrationSingleSheetIllustration,
  DoubleFeedCalibrationDoubleSheetIllustration,
} from './double_feed_calibration_images';

function DoubleFeedCalibrationImages(): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <DoubleFeedCalibrationSingleSheetIllustration />
      <DoubleFeedCalibrationDoubleSheetIllustration />
    </div>
  );
}

const meta: Meta<typeof DoubleFeedCalibrationImages> = {
  title: 'libs-ui/Images',
  component: DoubleFeedCalibrationImages,
};

export default meta;

export { DoubleFeedCalibrationImages };
