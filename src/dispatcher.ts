import 'reflect-metadata';
import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { Container } from './container';
import { buildRoutes, matchRoute } from './router';
import { HttpMethod } from './decorators/methods';
import { PARAMS_METADATA_KEY, ParamDefinition } from './decorators/params';
import { runZodValidationPipe } from './pipes/zod-validation.pipe';
import { authGuard } from './guards/auth.guard';
import { loggingInterceptor } from './interceptors/logging.interceptor';
import { handleException } from './filters/exception.filter';
import { emitLifecycleEvent } from './lifecycle-events';
import { sendJson } from './http-response';
import { NotFoundError, ForbiddenError, ValidationError } from './errors';
import { RequestContext, runWithRequestContext, resolveRequestId } from './context/request-context';

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

async function readBodyStage(ctx: RequestContext): Promise<void> {
  if (ctx.method !== 'POST') {
    return;
  }
  try {
    ctx.rawBody = await readJsonBody(ctx.req);
  } catch {
    throw new ValidationError([{ field: 'body', constraints: ['Invalid JSON body'] }]);
  }
}

function buildArgsStage(ctx: RequestContext): void {
  const match = ctx.match!;
  const { controller, handlerName } = match.route;
  const paramsMap: Record<number, ParamDefinition> =
    Reflect.getOwnMetadata(PARAMS_METADATA_KEY, controller.prototype, handlerName) ?? {};
  const paramTypes: unknown[] =
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
      args[index] = definition.schema
        ? runZodValidationPipe(definition.schema, ctx.rawBody ?? {})
        : ctx.rawBody;
    }
  }

  ctx.args = args;
}

async function callHandlerStage(ctx: RequestContext): Promise<void> {
  const match = ctx.match!;
  const controllerInstance = ctx.container.resolve(match.route.controller) as Record<string | symbol, (...args: unknown[]) => unknown>;
  const handler = controllerInstance[match.route.handlerName];
  ctx.result = await handler.apply(controllerInstance, ctx.args ?? []);
}

function sendResponseStage(ctx: RequestContext): void {
  const statusCode = ctx.method === 'POST' ? 201 : 200;
  sendJson(ctx.res, statusCode, ctx.result);
}

async function execute(ctx: RequestContext): Promise<void> {
  await runWithRequestContext(ctx.requestId, async () => {
    try {
      emitLifecycleEvent(ctx.requestId, 'middleware');
      ctx.res.setHeader('X-Request-Id', ctx.requestId);
      await readBodyStage(ctx);

      const match = matchRoute(ctx.routes, ctx.method, ctx.url.pathname);
      if (!match) {
        throw new NotFoundError(`Cannot ${ctx.method} ${ctx.url.pathname}`);
      }
      ctx.match = match;

      emitLifecycleEvent(ctx.requestId, 'guard');
      if (!authGuard(ctx.req)) {
        throw new ForbiddenError();
      }

      await loggingInterceptor(ctx, async () => {
        emitLifecycleEvent(ctx.requestId, 'pipe');
        buildArgsStage(ctx);

        emitLifecycleEvent(ctx.requestId, 'handler');
        await callHandlerStage(ctx);
      });

      sendResponseStage(ctx);
    } catch (error) {
      emitLifecycleEvent(ctx.requestId, 'filter');
      handleException(ctx.res, ctx.requestId, error);
    }
  });
}

export function createHttpApp(controllers: Ctor[], container: Container): Server {
  const routes = buildRoutes(controllers);
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const requestId = resolveRequestId(req.headers['x-request-id']);
      const ctx: RequestContext = {
        req,
        res,
        routes,
        container,
        method: (req.method ?? 'GET').toUpperCase() as HttpMethod,
        url: new URL(req.url ?? '/', 'http://localhost'),
        requestId,
      };
      await execute(ctx);
    })().catch((error) => {
      console.error(error);
      if (!res.headersSent) {
        sendJson(res, 500, { message: 'Internal server error' });
      }
    });
  });
}
