import type { RequestContext } from './context/request-context';

export type Guard = (ctx: RequestContext) => boolean | Promise<boolean>;

export type NextFn = () => Promise<void>;

export type Interceptor = (ctx: RequestContext, next: NextFn) => Promise<void>;
