import { performance } from 'node:perf_hooks';
import type { RequestContext } from '../context/request-context';
import type { NextFn } from '../pipeline-types';
import { emitLifecycleEvent } from '../lifecycle-events';

export async function loggingInterceptor(ctx: RequestContext, next: NextFn): Promise<void> {
  emitLifecycleEvent(ctx.requestId, 'interceptor:before');
  const startedAt = performance.now();
  await next();
  const durationMs = performance.now() - startedAt;
  console.log(`${ctx.method} ${ctx.url.pathname} — ${durationMs.toFixed(1)} ms`);
  emitLifecycleEvent(ctx.requestId, 'interceptor:after');
}
