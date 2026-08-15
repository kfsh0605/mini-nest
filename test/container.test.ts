import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../src/container';
import { Injectable } from '../src/decorators/injectable';
import { A, B, C, SingletonThing, TransientThing, NeedsConfig } from './fixtures';
import { CONFIG } from '../src/tokens';

describe('recursive graph resolution', () => {
  test('resolves A -> B -> C and produces live nested instances', () => {
    const container = new Container();
    const instanceA = container.resolve(A);

    assert.ok(instanceA instanceof A);
    assert.ok(instanceA.b instanceof B);
    assert.ok(instanceA.b.c instanceof C);
  });
});

describe('scopes', () => {
  test('singleton scope returns the same instance on every resolve', () => {
    const container = new Container();
    assert.equal(container.resolve(SingletonThing), container.resolve(SingletonThing));
  });

  test('transient scope returns a new instance on every resolve', () => {
    const container = new Container();
    assert.notEqual(container.resolve(TransientThing), container.resolve(TransientThing));
  });

  test('different container instances keep independent singleton caches', () => {
    const containerOne = new Container();
    const containerTwo = new Container();
    const instanceFromFirst = containerOne.resolve(SingletonThing);
    const instanceFromSecond = containerTwo.resolve(SingletonThing);
    assert.notEqual(instanceFromFirst, instanceFromSecond);
  });
});

describe('@Inject(token)', () => {
  test('resolves a dependency registered under a Symbol token', () => {
    const container = new Container();
    container.register(CONFIG, { url: 'postgres://localhost/demo' });

    const instance = container.resolve(NeedsConfig);

    assert.equal(instance.config.url, 'postgres://localhost/demo');
  });
});

describe('error handling', () => {
  class NotInjectable {}

  test('throws a clear error when resolving a class without @Injectable()', () => {
    const container = new Container();

    assert.throws(
      () => container.resolve(NotInjectable),
      /not marked with @Injectable/,
    );
  });
});

describe('circular dependency detection', () => {
  @Injectable()
  class CircularA {
    constructor(public dep: unknown) {}
  }

  @Injectable()
  class CircularB {
    constructor(public dep: unknown) {}
  }

  Reflect.defineMetadata('design:paramtypes', [CircularB], CircularA);
  Reflect.defineMetadata('design:paramtypes', [CircularA], CircularB);

  test('throws a descriptive error naming the full cycle, not a RangeError', () => {
    const container = new Container();
    let caughtError: unknown;

    try {
      container.resolve(CircularA);
      assert.fail('expected container.resolve(CircularA) to throw');
    } catch (error) {
      caughtError = error;
    }

    assert.ok(caughtError instanceof Error);
    assert.ok(!(caughtError instanceof RangeError));
    assert.match((caughtError as Error).message, /CircularA -> CircularB -> CircularA/);
  });
});
