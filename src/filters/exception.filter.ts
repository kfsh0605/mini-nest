import { ServerResponse } from 'node:http';
import { sendJson } from '../http-response';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

export function handleException(res: ServerResponse, requestId: string, error: unknown): void {
  if (error instanceof NotFoundError) {
    sendJson(res, 404, { message: error.message, requestId });
    return;
  }
  if (error instanceof ValidationError) {
    sendJson(res, 400, { message: 'Validation failed', errors: error.fields, requestId });
    return;
  }
  if (error instanceof ForbiddenError) {
    sendJson(res, 403, { message: error.message, requestId });
    return;
  }
  console.error(`[${requestId}]`, error);
  sendJson(res, 500, { message: 'Internal server error', requestId });
}
