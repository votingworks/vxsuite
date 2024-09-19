import { Meta } from '@storybook/react';
import {
  SmartCardImageProps,
  InsertCardImage,
  RemoveCardImage,
  RotateCardImage,
} from './smart_card_images';

function SmartCardImages(props: SmartCardImageProps): JSX.Element {
  return (
    <div>
      <InsertCardImage {...props} />
      <br />
      <RemoveCardImage {...props} />
      <br />
      <RotateCardImage {...props} />
    </div>
  );
}

const meta: Meta<typeof SmartCardImages> = {
  title: 'libs-ui/Images',
  component: SmartCardImages,
  args: {
    cardInsertionDirection: undefined,
  },
  argTypes: {
    cardInsertionDirection: {
      control: { type: 'radio' },
      options: ['up', 'down', 'left', 'right'],
    },
  },
};

export default meta;

export { SmartCardImages };
