import { render } from '../../test/react_testing_library';
import { CastBallotPage } from './cast_ballot_page';

it('renders CastBallotPage', () => {
  const { container } = render(
    <CastBallotPage hidePostVotingInstructions={jest.fn()} />
  );
  expect(container.firstChild).toMatchSnapshot();
});
