import { screen } from '@testing-library/react';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';

test('write-ins screen', () => {
  renderInAppContext(<WriteInsTranscriptionScreen />);
  screen.getByText('Fullscreen Modal Test');
});
