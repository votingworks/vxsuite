import 'setimmediate';
import React from 'react';
import ReactDom from 'react-dom';
import { App } from './app';
import { focusVisible } from './util/focus_visible';

ReactDom.render(<App />, document.getElementById('root'));

focusVisible();
