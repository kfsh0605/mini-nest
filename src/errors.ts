export interface FieldError {
  field: string;
  constraints: string[];
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(public readonly fields: FieldError[]) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = 'Forbidden resource') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
