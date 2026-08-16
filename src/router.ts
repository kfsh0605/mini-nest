import 'reflect-metadata';
import { CONTROLLER_PREFIX_METADATA_KEY } from './decorators/controller';
import { ROUTES_METADATA_KEY, RouteDefinition, HttpMethod } from './decorators/methods';

type Ctor<T = unknown> = new (...args: any[]) => T;

export interface CompiledRoute {
  httpMethod: HttpMethod;
  controller: Ctor;
  handlerName: string | symbol;
  pathSegments: string[];
}

export interface RouteMatch {
  route: CompiledRoute;
  params: Record<string, string>;
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function joinPaths(prefix: string, path: string): string {
  const segments = [...splitPath(prefix), ...splitPath(path)];
  return '/' + segments.join('/');
}

export function buildRoutes(controllers: Ctor[]): CompiledRoute[] {
  const routes: CompiledRoute[] = [];

  for (const controller of controllers) {
    const prefix: string = Reflect.getOwnMetadata(CONTROLLER_PREFIX_METADATA_KEY, controller) ?? '';
    const routeDefinitions: RouteDefinition[] =
      Reflect.getOwnMetadata(ROUTES_METADATA_KEY, controller.prototype) ?? [];

    for (const routeDefinition of routeDefinitions) {
      const fullPath = joinPaths(prefix, routeDefinition.path);
      routes.push({
        httpMethod: routeDefinition.httpMethod,
        controller,
        handlerName: routeDefinition.handlerName,
        pathSegments: splitPath(fullPath),
      });
    }
  }

  return routes;
}

export function matchRoute(
  routes: CompiledRoute[],
  httpMethod: HttpMethod,
  pathname: string,
): RouteMatch | null {
  const requestSegments = splitPath(pathname);

  for (const route of routes) {
    if (route.httpMethod !== httpMethod) continue;
    if (route.pathSegments.length !== requestSegments.length) continue;

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < route.pathSegments.length; i++) {
      const patternSegment = route.pathSegments[i];
      const actualSegment = requestSegments[i];

      if (patternSegment.startsWith(':')) {
        params[patternSegment.slice(1)] = decodeURIComponent(actualSegment);
      } else if (patternSegment !== actualSegment) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { route, params };
    }
  }

  return null;
}
