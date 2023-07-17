import { render } from '../../test/react_testing_library';
import { CastBallotPage } from './cast_ballot_page';

it('renders CastBallotPage', () => {
  render(<CastBallotPage hidePostVotingInstructions={jest.fn()} />);
});
