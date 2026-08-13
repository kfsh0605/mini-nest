import 'reflect-metadata';

export type InjectionToken = string | symbol;

export const INJECT_METADATA_KEY = Symbol('inject-tokens');

export function Inject(token: InjectionToken): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const existingTokens: Record<number, InjectionToken> =
      Reflect.getMetadata(INJECT_METADATA_KEY, target) ?? {};

    existingTokens[parameterIndex] = token;

    Reflect.defineMetadata(INJECT_METADATA_KEY, existingTokens, target);
  };
}
