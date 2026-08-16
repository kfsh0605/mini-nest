import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

type Ctor<T> = new () => T;

export interface FieldError {
  field: string;
  constraints: string[];
}

export type ValidationOutcome<T> =
  | { success: true; value: T }
  | { success: false; errors: FieldError[] };

function flattenErrors(errors: ValidationError[]): FieldError[] {
  return errors.map((error) => ({
    field: error.property,
    constraints: error.constraints ? Object.values(error.constraints) : ['invalid value'],
  }));
}

export async function runValidationPipe<T extends object>(
  dtoClass: Ctor<T>,
  rawBody: unknown,
): Promise<ValidationOutcome<T>> {
  const instance = plainToInstance(dtoClass, rawBody);

  const errors = await validate(instance as object);

  if (errors.length > 0) {
    return { success: false, errors: flattenErrors(errors) };
  }

  return { success: true, value: instance };
}
