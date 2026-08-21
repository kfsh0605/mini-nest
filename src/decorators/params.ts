import 'reflect-metadata';
import { z } from 'zod';

export const PARAMS_METADATA_KEY = Symbol('params');
export type ParamSource = 'body' | 'param' | 'query';

export interface ParamDefinition {
  source: ParamSource;
  name?: string;
  schema?: z.ZodType;
}

function defineParam(
  target: object,
  propertyKey: string | symbol | undefined,
  parameterIndex: number,
  definition: ParamDefinition,
): void {
  if (propertyKey === undefined) {
    throw new Error(`@${definition.source}() can only be used on method parameters`);
  }
  const existingParams: Record<number, ParamDefinition> =
    Reflect.getOwnMetadata(PARAMS_METADATA_KEY, target, propertyKey) ?? {};
  existingParams[parameterIndex] = definition;
  Reflect.defineMetadata(PARAMS_METADATA_KEY, existingParams, target, propertyKey);
}

export function Param(name?: string): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    defineParam(target, propertyKey, parameterIndex, { source: 'param', name });
  };
}

export function Query(name?: string): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    defineParam(target, propertyKey, parameterIndex, { source: 'query', name });
  };
}

export function Body(schema?: z.ZodType): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    defineParam(target, propertyKey, parameterIndex, { source: 'body', schema });
  };
}
