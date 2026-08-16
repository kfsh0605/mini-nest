import 'reflect-metadata';

export const ROUTES_METADATA_KEY = Symbol('routes');

export type HttpMethod = 'GET' | 'POST';

export interface RouteDefinition {
  httpMethod: HttpMethod;
  path: string;
  handlerName: string | symbol;
}

function createRouteDecorator(httpMethod: HttpMethod) {
  return (path: string = ''): MethodDecorator => {
    return (target, propertyKey) => {
      const existingRoutes: RouteDefinition[] =
        Reflect.getOwnMetadata(ROUTES_METADATA_KEY, target) ?? [];

      existingRoutes.push({ httpMethod, path, handlerName: propertyKey });

      Reflect.defineMetadata(ROUTES_METADATA_KEY, existingRoutes, target);
    };
  };
}

export const Get = createRouteDecorator('GET');
export const Post = createRouteDecorator('POST');
