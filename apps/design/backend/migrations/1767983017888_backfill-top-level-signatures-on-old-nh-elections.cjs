exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void>}
 *
 * NH clerk signature images and captions were previously stored on precinct split objects. We've
 * since introduced top-level fields for this data on election objects. The fields on the precinct
 * split object still exist for override purposes however, e.g., when a school district ballot
 * needs a school clerk signature rather than a town clerk signature.
 *
 * For elections using the NH template, ballot rendering errors when these fields are missing on
 * the election object, hence the motivation for this migration, which moves this data from the
 * relevant precinct split objects to the election objects, where possible.
 */
exports.up = async (pgm) => {
  const electionsMissingRequiredSignature = await pgm.db.select({
    text: `
SELECT e.id, e.title, j.name AS "jurisdictionName"
FROM elections e
JOIN jurisdictions j ON e.jurisdiction_id = j.id
WHERE e.ballot_template_id = 'NhBallot' AND e.signature IS NULL
`,
  });
  for (const election of electionsMissingRequiredSignature) {
    const townPrecinctSplits = await pgm.db.select({
      text: `
SELECT ps.id, ps.name, ps.nh_options as "nhOptions"
FROM precinct_splits ps
JOIN precincts p ON ps.precinct_id = p.id
WHERE p.election_id = $1 AND ps.name ILIKE '%TOWN%' AND ps.nh_options IS NOT NULL
`,
      values: [election.id],
    });
    if (townPrecinctSplits.length === 1) {
      const { nhOptions } = townPrecinctSplits[0];
      if (!nhOptions.clerkSignatureImage || !nhOptions.clerkSignatureCaption) {
        continue;
      }

      // Copy signature data to the election object
      // eslint-disable-next-line vx/gts-object-literal-types
      const signature = {
        image: nhOptions.clerkSignatureImage,
        caption: nhOptions.clerkSignatureCaption,
      };
      await pgm.db.query({
        text: `UPDATE elections SET signature = $1 WHERE id = $2`,
        values: [signature, election.id],
      });

      // Clear signature data from the source precinct split object to ensure that later changes to
      // the election object are reflected and not overridden by data still on the precinct split
      // object
      // eslint-disable-next-line vx/gts-object-literal-types
      const nhOptionsWithoutClerkSignature = { ...nhOptions };
      delete nhOptionsWithoutClerkSignature.clerkSignatureImage;
      delete nhOptionsWithoutClerkSignature.clerkSignatureCaption;
      await pgm.db.query({
        text: `UPDATE precinct_splits SET nh_options = $1 WHERE id = $2`,
        values: [
          JSON.stringify(nhOptionsWithoutClerkSignature),
          townPrecinctSplits[0].id,
        ],
      });

      // eslint-disable-next-line no-console
      console.log(
        `Moved town clerk signature for ${election.jurisdictionName} ${election.title}`
      );
    }
  }
};
