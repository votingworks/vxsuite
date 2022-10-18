import * as z from 'zod';

export type OkResponse<Props = Record<string, unknown>> = {
  status: 'ok';
} & Props;

export const OkResponseSchema: z.ZodSchema<OkResponse> = z.object({
  status: z.literal('ok'),
});

export const ErrorsResponseSchema = z.object({
  status: z.literal('error'),
  errors: z.array(z.object({ type: z.string(), message: z.string() })),
});

export type ErrorsResponse = z.TypeOf<typeof ErrorsResponseSchema>;
