const TRANSLATION_SOURCES_IN_ORDER_OF_PRECEDENCE = [
  'Vendored translations',
  'Cached cloud translations',
  'New cloud translations',
] as const;

type TranslationSource =
  (typeof TRANSLATION_SOURCES_IN_ORDER_OF_PRECEDENCE)[number];

/**
 * A simple class for maintaining and printing counts of how translations were acquired
 */
export class TranslationSourceCounts {
  private readonly counts: Record<TranslationSource, number>;

  constructor() {
    this.counts = {
      'Vendored translations': 0,
      'Cached cloud translations': 0,
      'New cloud translations': 0,
    };
  }

  increment(source: TranslationSource): void {
    this.counts[source] += 1;
  }

  print(): void {
    /* eslint-disable no-console */
    console.log('🌎 Translation source counts');
    console.table(
      TRANSLATION_SOURCES_IN_ORDER_OF_PRECEDENCE.map((source) => ({
        Source: source,
        Count: this.counts[source],
      }))
    );
    /* eslint-enable no-console */
  }
}
