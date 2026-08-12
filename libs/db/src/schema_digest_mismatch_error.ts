/**
 * Thrown when an existing database was created with a different schema than the
 * currently running software expects. Outside of production the database is
 * reset instead, but in production resetting would silently discard data, so a
 * human must decide how to proceed.
 */
export class SchemaDigestMismatchError extends Error {
  constructor(dbPath: string, expectedDigest: string, actualDigest?: string) {
    super(
      `Database at ${dbPath} was created with schema digest ${
        actualDigest ?? '(none)'
      }, but the currently running software expects schema digest ${expectedDigest}. ` +
        `Refusing to reset the database because that would discard its data.`
    );
  }
}
