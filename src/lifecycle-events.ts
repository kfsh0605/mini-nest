import { EventEmitter } from 'node:events';

export const lifecycleEvents = new EventEmitter();

export function emitLifecycleEvent(requestId: string, stage: string): void {
  console.log(`[${requestId}] ${stage}`);
  lifecycleEvents.emit('stage', requestId, stage);
}
