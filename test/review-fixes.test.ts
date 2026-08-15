import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '../src/container';
import { Injectable } from '../src/decorators/injectable';
import { Inject } from '../src/decorators/inject';

describe('regression: cycle detection must key by class reference, not by class name', () => {
  @Injectable()
  class SameTwo {}

  @Injectable()
  class MidForSameNameTest {
    constructor(public same: SameTwo) {}
  }

  @Injectable()
  class SameOne {
    constructor(public mid: MidForSameNameTest) {}
  }

  @Injectable()
  class RootForSameNameTest {
    constructor(public same: SameOne) {}
  }

  Object.defineProperty(SameOne, 'name', { value: 'Same' });
  Object.defineProperty(SameTwo, 'name', { value: 'Same' });

  test('does not report a false circular dependency when two unrelated classes share the same .name', () => {
    const container = new Container();
    const instance = container.resolve(RootForSameNameTest);

    assert.ok(instance.same instanceof SameOne);
    assert.ok(instance.same.mid instanceof MidForSameNameTest);
    assert.ok(instance.same.mid.same instanceof SameTwo);
  });
});

describe('regression: @Inject metadata must not leak between parent and child classes', () => {
  const TOKEN_A = Symbol.for('REVIEW_FIX_TOKEN_A');
  const TOKEN_B = Symbol.for('REVIEW_FIX_TOKEN_B');

  @Injectable()
  class InjectParent {
    constructor(@Inject(TOKEN_A) public value: unknown) {}
  }

  @Injectable()
  class InjectChild extends InjectParent {
    constructor(@Inject(TOKEN_B) value: unknown) {
      super(value);
    }
  }

  test('a subclass @Inject() does not overwrite the parent class own metadata', () => {
    const container = new Container();
    container.register(TOKEN_A, 'value-a');
    container.register(TOKEN_B, 'value-b');

    const parentInstance = container.resolve(InjectParent);
    const childInstance = container.resolve(InjectChild);

    assert.equal(parentInstance.value, 'value-a');
    assert.equal(childInstance.value, 'value-b');
  });
});

describe('regression: a subclass must have its own @Injectable(), inheritance is not enough', () => {
  @Injectable()
  class InjectableBase {}

  class NotDecoratedChild extends InjectableBase {}

  test('throws when resolving a subclass that has no @Injectable() of its own', () => {
    const container = new Container();

    assert.throws(
      () => container.resolve(NotDecoratedChild),
      /not marked with @Injectable/,
    );
  });
});
