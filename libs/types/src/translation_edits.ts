import { z } from 'zod/v4';

export interface TranslationEditKey {
  jurisdictionId: string;
  languageCode: string;
  englishText: string;
}

export const TranslationEditKeySchema: z.ZodType<TranslationEditKey> = z.object(
  {
    jurisdictionId: z.string(),
    languageCode: z.string(),
    englishText: z.string(),
  }
);

export interface TranslationEdit {
  text: string;
}

export const TranslationEditSchema: z.ZodType<TranslationEdit> = z.object({
  text: z.string(),
});

export type TranslationEditEntry = TranslationEdit & {
  languageCode: string;
  englishText: string;
};
