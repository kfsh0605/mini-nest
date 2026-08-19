import 'reflect-metadata';

export const PARAMS_METADATA_KEY = Symbol('params');

export type ParamSource = 'body' | 'param' | 'query';

export interface ParamDefinition {
  source: ParamSource;
  name?: string;
}

function createParamDecorator(source: ParamSource) {
  return (name?: string): ParameterDecorator => {
    return (target, propertyKey, parameterIndex) => {
      if (propertyKey === undefined) {
        throw new Error(`@${source}() can only be used on method parameters`);
      }

      const existingParams: Record<number, ParamDefinition> =
        Reflect.getOwnMetadata(PARAMS_METADATA_KEY, target, propertyKey) ?? {};

      existingParams[parameterIndex] = { source, name };

      Reflect.defineMetadata(PARAMS_METADATA_KEY, existingParams, target, propertyKey);
    };
  };
}

export const Body = createParamDecorator('body');
export const Param = createParamDecorator('param');
export const Query = createParamDecorator('query');
