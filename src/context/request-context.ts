import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Container } from '../container';
import { CompiledRoute, RouteMatch } from '../router';
import { HttpMethod } from '../decorators/methods';

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  routes: CompiledRoute[];
  container: Container;
  method: HttpMethod;
  url: URL;
  requestId: string;
  match?: RouteMatch;
  rawBody?: unknown;
  args?: unknown[];
  result?: unknown;
}

interface RequestStore {
  requestId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestStore>();

export function runWithRequestContext<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  return requestContextStorage.run({ requestId }, fn);
}

export function getCurrentRequestId(): string {
  return requestContextStorage.getStore()?.requestId ?? 'no-request-context';
}

export function resolveRequestId(headerValue: string | string[] | undefined): string {
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }
  return randomUUID();
}
