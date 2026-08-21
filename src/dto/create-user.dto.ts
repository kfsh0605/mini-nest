import { z } from 'zod';

export const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().int().min(16),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
