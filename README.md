# mini-nest

A minimal reimplementation of NestJS's core mechanisms, built from scratch in TypeScript: a dependency-injection (IoC) container and a hand-rolled HTTP layer with decorator-based routing and DTO validation.

This is parts 1 and 2 of 3 in a training series (Node.js Pro course). Pipes/guards/interceptors/filters are planned for part 3.

## What this project demonstrates

`@Injectable()`, `@Controller()`, `@Get()`, `@Param()` and friends are not magic in NestJS -- they are calls to `Reflect.defineMetadata` that stash small pieces of information on a class or method, which framework code reads back later with `Reflect.getMetadata`. This project proves it twice: a container that resolves a dependency graph purely from compiler-emitted type metadata (part 1), and an HTTP router/dispatcher that turns that same metadata into real request handling over Node's raw `http` module (part 2) -- no NestJS, Express or Fastify involved.

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

## Project structure

| File | Purpose |
|---|---|
| `src/decorators/injectable.ts` | `@Injectable()` class decorator |
| `src/decorators/inject.ts` | `@Inject(token)` parameter decorator |
| `src/container.ts` | The IoC container |
| `src/tokens.ts` | Symbol tokens for dependencies without a class |
| `src/decorators/controller.ts` | `@Controller(prefix)` class decorator |
| `src/decorators/methods.ts` | `@Get(path)` / `@Post(path)` method decorators |
| `src/decorators/params.ts` | `@Body()` / `@Param(name)` / `@Query(name)` parameter decorators |
| `src/router.ts` | Builds a flat route table from controller metadata and matches incoming requests against it |
| `src/dispatcher.ts` | The `node:http` server: reads the request, matches a route, builds handler arguments, calls the handler, writes the response |
| `src/pipes/validation.pipe.ts` | Runs `class-validator`/`class-transformer` against a `@Body()` DTO before the handler runs |
| `src/dto/create-user.dto.ts` | Example DTO with validation rules |
| `src/services/user.service.ts` | Example `@Injectable()` service (in-memory user store) |
| `src/controllers/users.controller.ts` | Example controller wiring routes to the service |
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

At request time, `buildHandlerArgs()` in `dispatcher.ts` reads that same map back for the specific handler being called, and walks it by index in order (`0, 1, 2, ...`). For each index it checks which source was recorded -- `'param'` reads `routeMatch.params[name]` (captured by the router from the URL), `'query'` reads `requestUrl.searchParams.get(name)`, `'body'` runs the parsed JSON body through the validation pipe -- and places the resulting value at that same index in a plain array. Because JavaScript function parameters are positional, building the array in the correct index order and then calling `handler.apply(controllerInstance, args)` guarantees each value lands in the exact parameter slot the decorator was originally attached to, even though the decorator ran once at class-definition time and this code runs per-request, long after.

### DTO validation

For a `@Body()` parameter, the dispatcher also looks at `design:paramtypes` -- the same compiler-emitted array used by the IoC container -- to find the *actual class* of that parameter (e.g. `CreateUserDto`). It passes the parsed JSON body and that class to `runValidationPipe()`, which uses `class-transformer`'s `plainToInstance()` to turn the plain object into a real instance of the class (validators only work on real instances, not plain objects), then `class-validator`'s `validate()` to check the decorators on that class (`@IsEmail()`, `@Min(16)`, etc.). If validation fails, the dispatcher responds `400` with a field-by-field list of errors and never calls the handler; if it succeeds, the handler receives a fully validated, correctly-typed DTO instance instead of an untrusted plain object.

## Example routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/users` | List users, optional `?limit=` query param |
| `GET` | `/users/:id` | Get a single user by id |
| `POST` | `/users` | Create a user; body is validated against `CreateUserDto` |

## Scopes

| Scope | Behavior |
|---|---|
| `singleton` (default) | One instance per container; `container.resolve(X) === container.resolve(X)` is `true` |
| `transient` | A new instance is created on every `resolve()` call |

Set via the decorator argument: `@Injectable({ scope: 'transient' })`.

## Constraints

This project is a training artifact, deliberately built without any existing DI or HTTP framework (`@nestjs/*`, `inversify`, `tsyringe`, `typedi`, `express`, `fastify`). The only third-party runtime dependencies are `class-validator` and `class-transformer`, used strictly for DTO validation, not for routing or DI.
