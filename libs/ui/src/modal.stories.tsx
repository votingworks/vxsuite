import React from 'react';
import { Meta } from '@storybook/react';

import { Modal as Component, ModalProps } from './modal';
import { Button } from './button';
import { H2, P } from './typography';

const meta: Meta<typeof Component> = {
  title: 'libs-ui/Modal',
  component: Component,
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
              <Button onPress={setIsOpen} value={false} variant="done">
                Save
              </Button>
              <Button onPress={setIsOpen} value={false}>
                Cancel
              </Button>
            </React.Fragment>
          }
          content={
            <div>
              <H2 as="h1">Confirm Save</H2>
              <P>Would you like to save your changes?</P>
            </div>
          }
          {...props}
        />
      )}
    </div>
  );
}
