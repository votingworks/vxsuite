# Smart Card Data Format

Via fetches to the API exposed by `module-smartcard`, BMD can read data stored
on a memory smart card. This is used for:

- ballot activation: voters have their ballot style encoded on their activation
  card
- administrative tasks: poll workers can configure the BMD, open and close the
  election

## Short and Long Values on the smart card

Because reading from / writing to the smart card can be slow for anything more
than a few bytes, the `module-smartcard` API exposes a short value that is up to
250 bytes, and a long value that is up to 32,000 bytes. The short value is read
by defaut, while the long value is only read upon request.

## Short Value

The short value on the card is always serialized JSON with short field names to
save space. Every short value must be valid serialized JSON, with at least the
following fields:

- `t` -- the type of card, e.g. `voter` or `pollworker` or `clerk`

## Voter

A voter card includes the following additional fields in the short value's
serialized JSON:

- `bs` -- the ballot style ID as a string
- `pr` -- the precinct ID as a string
- `uz` -- optionally, the Unix timestamp at which a card was used (thus `uz`) to
  print a ballot. Once this field is set, the card is no longer usable to print
  another ballot

A voter card does _not_ use the long value on the card.

## Poll Worker

A poll worker card includes the following additional fields in the short value's
serialized JSON:

- `h` -- the base64-encoded SHA256 of the election for which this is a valid
  poll worker card

A poll-worker card does _not_ use the long value on the card.

## Clerk Card

The clerk card is the full administrative card, and contains the following
fields in the short value.

- `h` -- the base64-encoded SHA256 of the `election.json`

The clerk card also includes the serialized `election.json` in the long value of
the card. This is the value which, when hashed with SHA256, should match `h` in
both the clerk and poll-worker cards.
