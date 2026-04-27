import { describe, expect, test, vi } from 'vitest';
import {
  electionOpenPrimaryFixtures,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  BallotStyleId,
  hasSplits,
  Precinct,
  PrecinctOrSplit,
} from '@votingworks/types';

import userEvent from '@testing-library/user-event';

import { assert } from '@votingworks/basics';
import { render, screen } from '../../../test/react_testing_library';
import {
  BallotStyleSelect,
  BallotStyleSelectProps,
} from './ballot_style_select';

describe('general election', () => {
  const electionGeneralDefinition = readElectionGeneralDefinition();
  const { election } = electionGeneralDefinition;

  test('single precinct configuration', () => {
    const precinct = election.precincts[0];
    const ballotStyle = election.ballotStyles[0];
    const onSelect = vi.fn();

    renderSelect({
      election,
      onSelect,
      configuredPrecinctsAndSplits: toPrecinctsOrSplitList([precinct]),
    });

    userEvent.click(screen.getButton(`Start Voting Session: ${precinct.name}`));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(precinct.id, ballotStyle.id);
  });

  test('single precinct configuration with splits', () => {
    const precinct = election.precincts[1];
    assert(hasSplits(precinct));
    const [ballotStyle1, ballotStyle2] = election.ballotStyles;
    const onSelect = vi.fn();

    renderSelect({
      election,
      onSelect,
      configuredPrecinctsAndSplits: toPrecinctsOrSplitList([precinct]),
    });

    userEvent.click(screen.getByText('Select ballot style…'));
    userEvent.click(screen.getByText(precinct.splits[0].name));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(precinct.id, ballotStyle2.id);

    onSelect.mockClear();

    userEvent.click(screen.getByText(precinct.splits[0].name));
    userEvent.click(screen.getByText(precinct.splits[1].name));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(precinct.id, ballotStyle1.id);
  });

  test('multiple precincts/splits', () => {
    const [p1, p2] = election.precincts;
    assert(hasSplits(p2));
    const [ballotStyle1, ballotStyle2] = election.ballotStyles;
    const onSelect = vi.fn();

    renderSelect({
      election,
      onSelect,
      configuredPrecinctsAndSplits: toPrecinctsOrSplitList([p1, p2]),
    });

    userEvent.click(screen.getByText('Select ballot style…'));
    userEvent.click(screen.getByText(p1.name));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(p1.id, ballotStyle1.id);

    onSelect.mockClear();

    userEvent.click(screen.getByText(p1.name));
    userEvent.click(screen.getByText(p2.splits[0].name));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(p2.id, ballotStyle2.id);

    onSelect.mockClear();

    userEvent.click(screen.getByText(p2.splits[0].name));
    userEvent.click(screen.getByText(p2.splits[1].name));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(p2.id, ballotStyle1.id);
  });
});

describe('primary election', () => {
  const electionDefinitionPrimary =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { election } = electionDefinitionPrimary;

  test('single precinct configuration', () => {
    const precinct = election.precincts[0];

    const onSelect = vi.fn();

    renderSelect({
      election,
      onSelect,
      configuredPrecinctsAndSplits: toPrecinctsOrSplitList([precinct]),
    });

    screen.getByText('Select ballot style:');
    screen.getButton('Fish');
    userEvent.click(screen.getButton('Mammal'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(precinct.id, '1-Ma_en');
  });

  test('single precinct configuration with splits', () => {
    const [, , , precinct] = election.precincts;
    assert(hasSplits(precinct));
    const onSelect = vi.fn();

    renderSelect({
      election,
      onSelect,
      configuredPrecinctsAndSplits: toPrecinctsOrSplitList([precinct]),
    });

    userEvent.click(screen.getByText("Select voter's precinct…"));
    userEvent.click(screen.getByText(precinct.splits[0].name));
    screen.getByText('Select ballot style:');
    screen.getButton('Fish');
    userEvent.click(screen.getButton('Mammal'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(precinct.id, '3-Ma_en');

    onSelect.mockClear();

    userEvent.click(screen.getByText(precinct.splits[0].name));
    userEvent.click(screen.getByText(precinct.splits[1].name));
    screen.getByText('Select ballot style:');
    userEvent.click(screen.getButton('Fish'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(precinct.id, '4-F_en');
  });

  test('all precincts configuration', () => {
    const [p1, , , p4] = election.precincts;
    assert(hasSplits(p4));
    const onSelect = vi.fn();

    renderSelect({
      election,
      onSelect,
      configuredPrecinctsAndSplits: toPrecinctsOrSplitList([p1, p4]),
    });

    userEvent.click(screen.getByText("Select voter's precinct…"));
    userEvent.click(screen.getByText(p1.name));
    userEvent.click(screen.getButton('Mammal'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(p1.id, '1-Ma_en');

    onSelect.mockClear();

    userEvent.click(screen.getByText(p1.name));
    userEvent.click(screen.getByText(p4.splits[0].name));
    userEvent.click(screen.getButton('Mammal'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(p4.id, '3-Ma_en');

    onSelect.mockClear();

    userEvent.click(screen.getByText(p4.splits[0].name));
    userEvent.click(screen.getByText(p4.splits[1].name));
    userEvent.click(screen.getButton('Fish'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(p4.id, '4-F_en');
  });
});

describe('open primary election', () => {
  const electionDefinitionOpenPrimary =
    electionOpenPrimaryFixtures.readElectionDefinition();
  const { election } = electionDefinitionOpenPrimary;

  test('single precinct configuration', () => {
    const precinct = election.precincts[0];
    const onSelect = vi.fn();

    renderSelect({
      election,
      onSelect,
      configuredPrecinctsAndSplits: toPrecinctsOrSplitList([precinct]),
    });

    // No party picker — pressing the precinct button immediately selects the
    // precinct's single (partyless) ballot style.
    userEvent.click(screen.getButton(`Start Voting Session: ${precinct.name}`));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(
      precinct.id,
      'ballot-style-1' as BallotStyleId
    );
  });

  test('multiple precincts configuration', () => {
    const [p1, p2] = election.precincts;
    const onSelect = vi.fn();

    renderSelect({
      election,
      onSelect,
      configuredPrecinctsAndSplits: toPrecinctsOrSplitList([p1, p2]),
    });

    userEvent.click(screen.getByText('Select ballot style…'));
    userEvent.click(screen.getByText(p2.name));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith(
      p2.id,
      'ballot-style-2' as BallotStyleId
    );
  });
});

function renderSelect(props: BallotStyleSelectProps) {
  render(<BallotStyleSelect {...props} />);
}

function toPrecinctsOrSplitList(precincts: Precinct[]): PrecinctOrSplit[] {
  const list: PrecinctOrSplit[] = [];

  for (const precinct of precincts) {
    if (!hasSplits(precinct)) {
      list.push({ precinct });
      continue;
    }

    for (const split of precinct.splits) {
      list.push({ precinct, split });
    }
  }

  return list;
}
