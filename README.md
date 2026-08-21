# mini-nest

A minimal reimplementation of NestJS's core mechanisms, built from scratch in TypeScript: a dependency-injection (IoC) container, a hand-rolled HTTP layer with decorator-based routing, and a complete request lifecycle (middleware, guards, interceptors, pipes, exception filters, request-scoped context via `AsyncLocalStorage`).

This is the complete training series (parts 1-3 of 3).

## What this project demonstrates

`@Injectable()`, `@Controller()`, `@Get()`, `@Param()`, `@UseGuards`-style guards, interceptors and exception filters are not magic in NestJS -- they are calls to `Reflect.defineMetadata` plus a fixed, well-defined order in which a request passes through a handful of well-scoped functions. This project proves it three times over: a container that resolves a dependency graph purely from compiler-emitted type metadata (part 1), an HTTP router/dispatcher that turns that same metadata into real request handling over Node's raw `http` module (part 2), and the full request lifecycle -- middleware, guard, interceptor, pipe, handler, exception filter, request-scoped `requestId` via `AsyncLocalStorage` -- all hand-rolled, with no NestJS, Express, Fastify or RxJS involved (part 3).

## Requirements

- Node.js 22+
- TypeScript 6.x
- Docker Desktop (optional, for running tests in a container)

## How to run

Install dependencies:

```bash
npm install
```

Run the test suite (compiles TypeScript, then runs tests with Node's built-in test runner):

```bash
npm test
```

Run the test suite inside Docker:

```bash
docker compose run --rm api npm test
```

Every route now goes through a global auth guard, so manual requests need an `Authorization` header:

```bash
curl -si -H "Authorization: Bearer any-non-empty-token" localhost:3000/users/1
```

## Project structure

| File | Purpose |
|---|---|
| `src/decorators/injectable.ts` | `@Injectable()` class decorator |
| `src/decorators/inject.ts` | `@Inject(token)` parameter decorator |
| `src/container.ts` | The IoC container |
| `src/tokens.ts` | Symbol tokens for dependencies without a class |
| `src/decorators/controller.ts` | `@Controller(prefix)` class decorator |
| `src/decorators/methods.ts` | `@Get(path)` / `@Post(path)` method decorators |
| `src/decorators/params.ts` | `@Body(schema)` / `@Param(name)` / `@Query(name)` parameter decorators |
| `src/router.ts` | Builds a flat route table from controller metadata and matches incoming requests against it |
| `src/dispatcher.ts` | The `node:http` server: runs every request through the full lifecycle (`execute(ctx)`) and writes the response |
| `src/errors.ts` | Domain error types (`NotFoundError`, `ValidationError`, `ForbiddenError`) that stages throw instead of answering HTTP directly |
| `src/http-response.ts` | Shared `sendJson()` helper (kept separate to avoid a circular import between the dispatcher and the exception filter) |
| `src/lifecycle-events.ts` | Event bus used to record/observe the exact stage order of a request (used by tests) |
| `src/context/request-context.ts` | `AsyncLocalStorage`-backed per-request context: `requestId` generation/lookup |
| `src/guards/auth.guard.ts` | `AuthGuard`: checks the `Authorization` header, returns `boolean` |
| `src/interceptors/logging.interceptor.ts` | `LoggingInterceptor`: wraps pipe+handler, logs `METHOD /path — N ms` |
| `src/pipes/zod-validation.pipe.ts` | Runs a Zod schema against a `@Body()` argument before the handler runs |
| `src/filters/exception.filter.ts` | The single place that maps any thrown error to an HTTP response |
| `src/dto/create-user.dto.ts` | Example Zod schema (`CreateUserSchema`) with validation rules |
| `src/services/user.service.ts` | Example `@Injectable()` service (in-memory user store); reads `requestId` from ALS, throws `NotFoundError` |
| `src/controllers/users.controller.ts` | Example controller wiring routes to the service |
| `test/lifecycle-order.test.ts` | Locks in the exact stage order (happy path and error path) |
| `test/` | Tests |

## How it works: IoC container

TypeScript's compiler can emit design-time type metadata for a class's constructor parameters, but only when two conditions are both true: the `emitDecoratorMetadata` compiler flag is enabled in `tsconfig.json`, **and** the class carries at least one decorator. If either condition is missing, `Reflect.getMetadata('design:paramtypes', SomeClass)` returns `undefined` -- the class simply looks like it has no dependencies, with no error to warn you.

When both conditions hold, `@Injectable()` marks the class as safe for the container to instantiate, and the compiler writes an array of the constructor's parameter types (as real constructor references) into the class's metadata via `Reflect.defineMetadata('design:paramtypes', [...], TargetClass)`. `Container.resolve()` reads that array back with `Reflect.getMetadata`, and for each parameter, recursively resolves it the same way -- building the whole dependency tree bottom-up, from the deepest dependency to the requested class.

Interfaces and other TypeScript-only types don't exist at runtime, so the compiler can't put a real reference for them in the metadata -- it substitutes the generic `Object`. That's what `@Inject(token)` is for: it lets you register a value under an explicit `Symbol` or string token (via `container.register(token, value)`) and bypass type-based resolution entirely for that specific parameter.

The container also tracks the chain of classes visited during the current `resolve()` call. If a class shows up twice in that chain, it means two classes depend on each other (directly or transitively) -- instead of recursing forever and crashing with a generic `RangeError: Maximum call stack size exceeded`, the container throws an error naming the full cycle, e.g. `Circular dependency detected: A -> B -> A`.

## How it works: HTTP layer

### Routing

`@Controller('users')` stores a path prefix on the class via `Reflect.defineMetadata`. `@Get(':id')` / `@Post()` push a `{ httpMethod, path, handlerName }` record into an array stored on the class's *prototype* -- using `Reflect.getOwnMetadata` to read the existing array first, so multiple decorated methods on the same controller accumulate into one list instead of overwriting each other.

At startup, `buildRoutes()` walks every registered controller, reads its prefix and its array of route records, concatenates prefix + path into one path (e.g. `users` + `:id` -> `/users/:id`), and splits it into segments (`['users', ':id']`). At request time, `matchRoute()` splits the incoming URL the same way and compares segment by segment: a segment starting with `:` always matches and its value is captured as a route parameter, any other segment must match literally, and the segment counts must be equal.

### How a parameter decorator knows where to substitute its value

Take `findOne(@Param('id') id: string)`. When TypeScript compiles this method, it calls the `Param('id')` decorator with three arguments: the class prototype, the method name (`'findOne'`), and the **index of the parameter** it's attached to (`0`, since `id` is the first parameter). The decorator uses that index as a key: it reads the existing per-method map (if any) with `Reflect.getOwnMetadata(PARAMS_METADATA_KEY, target, propertyKey)`, adds `{ 0: { source: 'param', name: 'id' } }` to it, and writes it back with `Reflect.defineMetadata(PARAMS_METADATA_KEY, map, target, propertyKey)`. The 4-argument form of `defineMetadata`/`getMetadata` matters here -- it scopes the metadata to one specific method, so two different handlers on the same controller (with different parameter lists) don't clobber each other's maps.

At request time, the dispatcher's pipe stage reads that same map back for the specific handler being called, and walks it by index in order (`0, 1, 2, ...`). For each index it checks which source was recorded -- `'param'` reads `routeMatch.params[name]`, `'query'` reads `url.searchParams.get(name)`, `'body'` runs the parsed JSON body through the Zod pipe -- and places the resulting value at that same index in a plain array. Because JavaScript function parameters are positional, building the array in the correct index order and then calling `handler.apply(controllerInstance, args)` guarantees each value lands in the exact parameter slot the decorator was originally attached to.

### DTO validation (Zod)

Unlike part 2 (which used `class-validator`/`class-transformer` and inferred the DTO class from `design:paramtypes`), `@Body()` now takes the validation schema as an **explicit argument**: `@Body(CreateUserSchema)`. Zod schemas are plain values, not classes with decorators, so there is no `reflect-metadata` type to read at runtime -- the schema has to be passed in directly, and it is stored on the same per-parameter metadata map as `@Param`/`@Query`. At request time the pipe stage calls `schema.safeParse(rawBody)`; on failure it throws a `ValidationError` carrying a field-by-field list of issues (`error.issues` in Zod 4 -- the shape changed from `error.errors` in Zod 3, which trips up most examples still floating around online); on success it returns the parsed, correctly-typed value, which becomes the handler's argument.

## How it works: request lifecycle

Every request goes through the same six stages, in the same order, whether it succeeds or fails partway through:

Request
|
v
[1] middleware -- raw req/res, controller not yet known. requestId is read from
| X-Request-Id or generated; AsyncLocalStorage.run() starts HERE,
| wrapping everything below; JSON body is read here too.
v
route match (technical step, not one of the six named stages -- no route
| found -> NotFoundError, straight to the filter)
v
[2] guard -- AuthGuard checks Authorization. Returns boolean only.
| false -> ForbiddenError -> straight to the filter, nothing below runs.
v
[3] interceptor (before) --
| |
v |
[4] pipe | LoggingInterceptor wraps steps 4-5 in one closure:
| | it can see both the call and the result.
v |
[5] handler |
| |
v |
[3] interceptor (after) --/ -- logs "METHOD /path — N ms". Only reached if
| steps 4-5 did NOT throw.
v
Response sent

A throw at ANY point above (middleware, guard, pipe, handler, or even inside the
interceptor's own code) skips every remaining step and lands in exactly one place:

[6] exception filter -- NotFoundError -> 404, ValidationError -> 400 + field list,
ForbiddenError -> 403, anything else -> 500 with no stack
trace or error text leaked to the client (full details are
still logged server-side).


This is exactly the sequence the test suite locks in (`test/lifecycle-order.test.ts`): on the happy path, the recorded stage labels are `['middleware', 'guard', 'interceptor:before', 'pipe', 'handler', 'interceptor:after']` -- `filter` never appears. If the handler (or anything it calls) throws, the recorded labels stop after `'handler'` and jump straight to `'filter'` -- `'interceptor:after'` never appears, because the interceptor's own "after" code is the line right after `await next()`, and a throw from inside `next()` skips past it entirely.

**Guard vs interceptor, in one sentence:** a guard answers one yes/no question *before* anything else runs and cannot touch the response; an interceptor wraps the call and sees both the input and the output, so it can measure, transform or even replace the response.

### Why `AsyncLocalStorage`, not a global variable

The naive fix -- `let currentRequestId` set at the start of each request -- looks like it works until two requests overlap. Node.js is single-threaded, but `await` hands control back to the event loop: while request A is waiting on `await readJsonBody(...)`, the event loop is free to start handling request B, which immediately overwrites `currentRequestId` with *its* id. When request A's `await` resolves and it goes to log `currentRequestId`, it logs B's id instead of its own -- a real, reproducible bug, not a hypothetical one (this is the same class of bug the course covered back in Lecture 2 with logger output getting mixed up under load). Passing `requestId` as an explicit parameter through every function signature would fix it, but it means every service, repository and logger call three levels deep now carries a parameter that has nothing to do with its actual job.

`AsyncLocalStorage` solves both problems at once: `als.run(store, callback)` creates a store that is bound to the *asynchronous call graph* rooted at that specific call, not to the process as a whole. Any code invoked (directly or through any number of `await`s, promises, or callbacks) from inside that `callback` sees the same store via `als.getStore()`, and code invoked from a *different* `als.run()` call -- even if it runs concurrently, even if the two overlap in time on the same event loop -- sees its own, separate store. One instance of `AsyncLocalStorage` lives for the whole process; a fresh store is created per request in `createHttpApp`'s request handler, before `execute(ctx)` is called, so every stage of the lifecycle (and any service called from deep inside a handler) can read `requestId` with zero parameters and zero risk of reading another request's value.

## Example routes

All routes require `Authorization: Bearer <any non-empty token>` (global `AuthGuard`).

| Method | Path | Description |
|---|---|---|
| `GET` | `/users` | List users, optional `?limit=` query param |
| `GET` | `/users/:id` | Get a single user by id; 404 (`NotFoundError`) if missing |
| `POST` | `/users` | Create a user; body is validated against `CreateUserSchema` (Zod) |

## Scopes

| Scope | Behavior |
|---|---|
| `singleton` (default) | One instance per container; `container.resolve(X) === container.resolve(X)` is `true` |
| `transient` | A new instance is created on every `resolve()` call |

Set via the decorator argument: `@Injectable({ scope: 'transient' })`.

## Constraints

This project is a training artifact, deliberately built without any existing DI, HTTP or reactive-streams framework (`@nestjs/*`, `inversify`, `tsyringe`, `typedi`, `express`, `fastify`, `rxjs`). The only third-party runtime dependency is `zod`, used strictly for `@Body()` validation, not for routing, DI or the lifecycle itself.