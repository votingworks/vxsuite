import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import React from 'react';
import ReactDom from 'react-dom';
import { AppRoot } from './app_root';

it('renders without crashing', () => {
  const card = new MemoryCard();
  const hardware = new MemoryHardware();
  const storage = new MemoryStorage();
  const div = document.createElement('div');
  ReactDom.render(
    <AppRoot card={card} hardware={hardware} storage={storage} />,
    div
  );
  ReactDom.unmountComponentAtNode(div);
});
