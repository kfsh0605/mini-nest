import 'reflect-metadata';
import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { Container } from './container';
import { buildRoutes, matchRoute, CompiledRoute, RouteMatch } from './router';
import { HttpMethod } from './decorators/methods';
import { PARAMS_METADATA_KEY, ParamDefinition } from './decorators/params';
import { runValidationPipe } from './pipes/validation.pipe';

type Ctor<T = unknown> = new (...args: any[]) => T;

interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  routes: CompiledRoute[];
  container: Container;
  method: HttpMethod;
  url: URL;
  match?: RouteMatch;
  rawBody?: unknown;
  args?: unknown[];
  result?: unknown;
}

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

function matchRouteStage(ctx: RequestContext): boolean {
  const match = matchRoute(ctx.routes, ctx.method, ctx.url.pathname);
  if (!match) {
    sendJson(ctx.res, 404, { message: `Cannot ${ctx.method} ${ctx.url.pathname}` });
    return false;
  }
  ctx.match = match;
  return true;
}

async function readBodyStage(ctx: RequestContext): Promise<boolean> {
  if (ctx.method !== 'POST') {
    return true;
  }
  try {
    ctx.rawBody = await readJsonBody(ctx.req);
    return true;
  } catch {
    sendJson(ctx.res, 400, { message: 'Invalid JSON body' });
    return false;
  }
}

async function buildArgsStage(ctx: RequestContext): Promise<boolean> {
  const match = ctx.match!;
  const { controller, handlerName } = match.route;
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
      args[index] = match.params[definition.name!];
    } else if (definition.source === 'query') {
      args[index] = ctx.url.searchParams.get(definition.name!) ?? undefined;
    } else if (definition.source === 'body') {
      const paramType = paramTypes[index];
      if (paramType && paramType !== Object) {
        const outcome = await runValidationPipe(paramType as Ctor<object>, ctx.rawBody ?? {});
        if (!outcome.success) {
          sendJson(ctx.res, 400, { message: 'Validation failed', errors: outcome.errors });
          return false;
        }
        args[index] = outcome.value;
      } else {
        args[index] = ctx.rawBody;
      }
    }
  }

  ctx.args = args;
  return true;
}

async function callHandlerStage(ctx: RequestContext): Promise<boolean> {
  const match = ctx.match!;
  const controllerInstance = ctx.container.resolve(match.route.controller) as Record<
    string | symbol,
    (...args: unknown[]) => unknown
  >;
  const handler = controllerInstance[match.route.handlerName];
  const result = await handler.apply(controllerInstance, ctx.args ?? []);
  if (result === undefined) {
    sendJson(ctx.res, 404, { message: 'Resource not found' });
    return false;
  }
  ctx.result = result;
  return true;
}

function sendResponseStage(ctx: RequestContext): void {
  const statusCode = ctx.method === 'POST' ? 201 : 200;
  sendJson(ctx.res, statusCode, ctx.result);
}

async function execute(ctx: RequestContext): Promise<void> {
  if (!matchRouteStage(ctx)) return;
  if (!(await readBodyStage(ctx))) return;
  if (!(await buildArgsStage(ctx))) return;
  if (!(await callHandlerStage(ctx))) return;
  sendResponseStage(ctx);
}

export function createHttpApp(controllers: Ctor[], container: Container): Server {
  const routes = buildRoutes(controllers);
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const ctx: RequestContext = {
        req,
        res,
        routes,
        container,
        method: (req.method ?? 'GET').toUpperCase() as HttpMethod,
        url: new URL(req.url ?? '/', 'http://localhost'),
      };
      await execute(ctx);
    })().catch((error) => {
      console.error(error);
      sendJson(res, 500, { message: 'Internal server error' });
    });
  });
}
