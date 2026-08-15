# mini-nest

A minimal IoC (Inversion of Control) container built from scratch in TypeScript, replicating the core dependency-resolution mechanism used internally by NestJS.

This is part 1 of 3 in a training series (Node.js Pro course). Controllers and DTOs are added in part 2, and pipes/guards/interceptors/filters in part 3.

## What this project demonstrates

`@Injectable()` in NestJS is not magic — it is two calls to `Reflect.defineMetadata`. This project proves it: a working container that reads constructor parameter types from TypeScript's compiler-emitted metadata and builds the dependency graph recursively, exactly like NestJS does under the hood.

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
| `src/container.ts` | The container itself |
| `src/tokens.ts` | Symbol tokens for dependencies without a class |
| `test/` | Tests |

## How it works

TypeScript's compiler can emit design-time type metadata for a class's constructor parameters, but only when two conditions are both true: the `emitDecoratorMetadata` compiler flag is enabled in `tsconfig.json`, **and** the class carries at least one decorator. If either condition is missing, `Reflect.getMetadata('design:paramtypes', SomeClass)` returns `undefined` — the class simply looks like it has no dependencies, with no error to warn you.

When both conditions hold, `@Injectable()` marks the class as safe for the container to instantiate, and the compiler writes an array of the constructor's parameter types (as real constructor references) into the class's metadata via `Reflect.defineMetadata('design:paramtypes', [...], TargetClass)`. `Container.resolve()` reads that array back with `Reflect.getMetadata`, and for each parameter, recursively resolves it the same way — building the whole dependency tree bottom-up, from the deepest dependency to the requested class.

Interfaces and other TypeScript-only types don't exist at runtime, so the compiler can't put a real reference for them in the metadata — it substitutes the generic `Object`. That's what `@Inject(token)` is for: it lets you register a value under an explicit `Symbol` or string token (via `container.register(token, value)`) and bypass type-based resolution entirely for that specific parameter.

The container also tracks the chain of classes visited during the current `resolve()` call. If a class shows up twice in that chain, it means two classes depend on each other (directly or transitively) — instead of recursing forever and crashing with a generic `RangeError: Maximum call stack size exceeded`, the container throws an error naming the full cycle, e.g. `Circular dependency detected: A -> B -> A`.

## Scopes

| Scope | Behavior |
|---|---|
| `singleton` (default) | One instance per container; `container.resolve(X) === container.resolve(X)` is `true` |
| `transient` | A new instance is created on every `resolve()` call |

Set via the decorator argument: `@Injectable({ scope: 'transient' })`.

## Constraints

This container is a training artifact, deliberately built without any existing DI library (`@nestjs/*`, `inversify`, `tsyringe`, `typedi`).
