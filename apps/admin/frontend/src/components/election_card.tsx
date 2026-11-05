const ElectionCard = styled(Card).attrs({ color: 'neutral' })`
  margin: 1rem 0;

  > div {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
  }
`;

      <ElectionCard>
        <Seal seal={election.seal} maxWidth="7rem" />
        <div>
          <H2 as="h3">{election.title}</H2>
          <P>
            {election.jurisdiction.name}, {election.state}
            <br />
            {format.localeLongDate(
              election.date.toMidnightDatetimeWithSystemTimezone()
            )}
          </P>
        </div>
      </ElectionCard>
