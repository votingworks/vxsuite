# Common Date Format (CDF) Types

The National Institute for Standards and Technology (NIST) has defined a set of
[Common Data Format (CDF) specifications](https://www.nist.gov/itl/voting/interoperability)
for various types of election data.

In order to support inputting/outputting data in these formats, we auto-generate
types and Zod schemas for each of the CDF specs using our
[CDF Schema Builder](../../../cdf-schema-builder/).

The NIST schemas can be found in the [data directory](../../data/). Note that
due to some weirdness with how NIST provides their schemas, we use both the XSD
(XML) format of the schema, which includes documentation, and the JSON format,
which includes the information we need to generate the types.

In certain cases we have needed to add extensions and/or constraints to the CDF
specs based on the needs of our system. In these cases, you will find a
`vx-schema.json` file that contains the VotingWorks version of the CDF schema in
the corresponding subdirectory here in `src/cdf`.
