import { expect, test } from 'vitest';
import React from 'react';
import { render, screen } from '../test/react_testing_library.js';
import { Modal } from './modal.js';
import {
  TopLayerPortal,
  getTopmostOpenDialog,
  registerOpenDialog,
} from './top_layer.js';

test('tracks open dialogs in stacking order', () => {
  const first = document.createElement('dialog');
  const second = document.createElement('dialog');
  expect(getTopmostOpenDialog()).toBeUndefined();

  const unregisterFirst = registerOpenDialog(first);
  const unregisterSecond = registerOpenDialog(second);
  expect(getTopmostOpenDialog()).toEqual(second);

  unregisterFirst();
  expect(getTopmostOpenDialog()).toEqual(second);

  unregisterSecond();
  expect(getTopmostOpenDialog()).toBeUndefined();
});

test('TopLayerPortal renders into the topmost open modal', () => {
  function TestComponent({ isModalOpen }: { isModalOpen: boolean }) {
    return (
      <React.Fragment>
        <TopLayerPortal>
          <div>Portaled</div>
        </TopLayerPortal>
        {isModalOpen && <Modal content="Content" />}
      </React.Fragment>
    );
  }

  const { rerender } = render(<TestComponent isModalOpen={false} />);
  expect(screen.getByText('Portaled').closest('dialog')).toBeNull();

  rerender(<TestComponent isModalOpen />);
  expect(screen.getByText('Portaled').closest('dialog')).toEqual(
    screen.getByRole('alertdialog')
  );

  rerender(<TestComponent isModalOpen={false} />);
  expect(screen.getByText('Portaled').closest('dialog')).toBeNull();
});
