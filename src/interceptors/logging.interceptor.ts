import type { RequestContext } from '../context/request-context';
import { emitLifecycleEvent } from '../lifecycle-events';

export async function loggingInterceptor(ctx: RequestContext, next: () => Promise<void>): Promise<void> {
  emitLifecycleEvent(ctx.requestId, 'interceptor:before');
  const startedAt = Date.now();
  await next();
  const durationMs = Date.now() - startedAt;
  console.log(`${ctx.method} ${ctx.url.pathname} — ${durationMs.toFixed(1)} ms`);
  emitLifecycleEvent(ctx.requestId, 'interceptor:after');
}
