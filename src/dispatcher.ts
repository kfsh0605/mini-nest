import 'reflect-metadata';
import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { Container } from './container';
import { buildRoutes, matchRoute, RouteMatch } from './router';
import { HttpMethod } from './decorators/methods';
import { PARAMS_METADATA_KEY, ParamDefinition } from './decorators/params';
import { runValidationPipe, FieldError } from './pipes/validation.pipe';

type Ctor<T = unknown> = new (...args: any[]) => T;

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(body);
}

async function buildHandlerArgs(
  controller: Ctor,
  handlerName: string | symbol,
  routeMatch: RouteMatch,
  query: URLSearchParams,
  rawBody: unknown,
): Promise<{ success: true; args: unknown[] } | { success: false; errors: FieldError[] }> {
  const paramsMap: Record<number, ParamDefinition> =
    Reflect.getOwnMetadata(PARAMS_METADATA_KEY, controller.prototype, handlerName) ?? {};
  const paramTypes: Ctor[] =
    Reflect.getOwnMetadata('design:paramtypes', controller.prototype, handlerName) ?? [];

  const parameterCount = Math.max(paramTypes.length, Object.keys(paramsMap).length);
  const args: unknown[] = new Array(parameterCount);

  for (let index = 0; index < parameterCount; index++) {
    const definition = paramsMap[index];

    if (!definition) {
      args[index] = undefined;
      continue;
    }

    if (definition.source === 'param') {
      args[index] = routeMatch.params[definition.name!];
    } else if (definition.source === 'query') {
      args[index] = query.get(definition.name!) ?? undefined;
    } else if (definition.source === 'body') {
      const paramType = paramTypes[index];

      if (paramType && paramType !== Object) {
        const outcome = await runValidationPipe(paramType as Ctor<object>, rawBody ?? {});
        if (!outcome.success) {
          return { success: false, errors: outcome.errors };
        }
        args[index] = outcome.value;
      } else {
        args[index] = rawBody;
      }
    }
  }

  return { success: true, args };
}

export function createHttpApp(controllers: Ctor[], container: Container): Server {
  const routes = buildRoutes(controllers);

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const requestUrl = new URL(req.url ?? '/', 'http://localhost');
      const httpMethod = (req.method ?? 'GET').toUpperCase() as HttpMethod;
      const match = matchRoute(routes, httpMethod, requestUrl.pathname);

      if (!match) {
        sendJson(res, 404, { message: `Cannot ${httpMethod} ${requestUrl.pathname}` });
        return;
      }

      let rawBody: unknown;
      if (httpMethod === 'POST') {
        try {
          rawBody = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { message: 'Invalid JSON body' });
          return;
        }
      }

      const argsOutcome = await buildHandlerArgs(
        match.route.controller,
        match.route.handlerName,
        match,
        requestUrl.searchParams,
        rawBody,
      );

      if (!argsOutcome.success) {
        sendJson(res, 400, { message: 'Validation failed', errors: argsOutcome.errors });
        return;
      }

      const controllerInstance = container.resolve(match.route.controller) as Record<
        string | symbol,
        (...args: unknown[]) => unknown
      >;
      const handler = controllerInstance[match.route.handlerName];
      const result = await handler.apply(controllerInstance, argsOutcome.args);

      const statusCode = httpMethod === 'POST' ? 201 : 200;
      sendJson(res, statusCode, result);
    })().catch((error) => {
      console.error(error);
      sendJson(res, 500, { message: 'Internal server error' });
    });
  });
}
