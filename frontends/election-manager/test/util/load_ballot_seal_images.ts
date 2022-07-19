import { fireEvent, screen } from '@testing-library/react';

export function loadBallotSealImages(): void {
  const ballotSealImages = screen.getAllByTestId('printed-ballot-seal-image');
  for (const ballotSealImage of ballotSealImages) {
    fireEvent.load(ballotSealImage);
  }
}
