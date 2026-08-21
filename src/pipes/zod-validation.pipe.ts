import { z } from 'zod';
import { ValidationError } from '../errors';

export function runZodValidationPipe<T>(schema: z.ZodType<T>, rawBody: unknown): T {
  const result = schema.safeParse(rawBody);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : '(root)',
      constraints: [issue.message],
    }));
    throw new ValidationError(fields);
  }
  return result.data;
}
