import 'reflect-metadata';

export type Scope = 'singleton' | 'transient';

export interface InjectableOptions {
  scope?: Scope;
}

export const INJECTABLE_METADATA_KEY = Symbol('injectable');
export const SCOPE_METADATA_KEY = Symbol('scope');

export function Injectable(options: InjectableOptions = {}): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(INJECTABLE_METADATA_KEY, true, target);
    Reflect.defineMetadata(SCOPE_METADATA_KEY, options.scope ?? 'singleton', target);
  };
}
