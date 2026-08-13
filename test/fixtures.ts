import 'reflect-metadata';
import { Injectable } from '../src/decorators/injectable';
import { Inject } from '../src/decorators/inject';
import { CONFIG } from '../src/tokens';

@Injectable()
export class C {
  readonly label = 'C';
}

@Injectable()
export class B {
  constructor(public c: C) {}
}

@Injectable()
export class A {
  constructor(public b: B) {}
}

@Injectable()
export class SingletonThing {}

@Injectable({ scope: 'transient' })
export class TransientThing {}

@Injectable()
export class NeedsConfig {
  constructor(@Inject(CONFIG) public config: { url: string }) {}
}
