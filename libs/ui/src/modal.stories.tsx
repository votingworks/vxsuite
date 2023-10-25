import React from 'react';
import { Meta } from '@storybook/react';

import { Modal as Component, ModalProps } from './modal';
import { Button } from './button';

const initialProps: ModalProps = {
  title: 'Confirm Save',
  content: 'Would you like to save your changes?',
};

const meta: Meta<typeof Component> = {
  title: 'libs-ui/Modal',
  component: Component,
  args: initialProps,
};

export default meta;

export function Modal(props: ModalProps): JSX.Element {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div>
      <Button onPress={setIsOpen} value>
        Open modal
      </Button>
      {isOpen && (
        <Component
          actions={
            <React.Fragment>
              <Button
                onPress={setIsOpen}
                value={false}
                variant="primary"
                icon="Done"
              >
                Save
              </Button>
              <Button onPress={setIsOpen} value={false}>
                Cancel
              </Button>
            </React.Fragment>
          }
          {...props}
        />
      )}
    </div>
  );
}
