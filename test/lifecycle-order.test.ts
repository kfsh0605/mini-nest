import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { Container } from '../src/container';
import { createHttpApp } from '../src/dispatcher';
import { UsersController } from '../src/controllers/users.controller';
import { lifecycleEvents } from '../src/lifecycle-events';

let server: Server;
let baseUrl: string;

describe('Request lifecycle order', () => {
  before(async () => {
    const container = new Container();
    const app = createHttpApp([UsersController], container);
    await new Promise<void>((resolve) => app.listen(0, resolve));
    server = app;
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Server did not bind to a TCP port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('happy path: middleware -> guard -> interceptor:before -> pipe -> handler -> interceptor:after', async () => {
    const requestId = 'lifecycle-happy-path';
    const events: string[] = [];
    const onStage = (id: string, stage: string) => {
      if (id === requestId) {
        events.push(stage);
      }
    };
    lifecycleEvents.on('stage', onStage);

    const response = await fetch(`${baseUrl}/users/1`, {
      headers: { Authorization: 'Bearer test-token', 'X-Request-Id': requestId },
    });
    assert.equal(response.status, 200);

    lifecycleEvents.off('stage', onStage);
    assert.deepEqual(events, [
      'middleware',
      'guard',
      'interceptor:before',
      'pipe',
      'handler',
      'interceptor:after',
    ]);
  });

  it('хендлер кидает ошибку - "interceptor:after" не появляется, вместо него "filter"', async () => {
    const requestId = 'lifecycle-error-path';
    const events: string[] = [];
    const onStage = (id: string, stage: string) => {
      if (id === requestId) {
        events.push(stage);
      }
    };
    lifecycleEvents.on('stage', onStage);

    const response = await fetch(`${baseUrl}/users/does-not-exist`, {
      headers: { Authorization: 'Bearer test-token', 'X-Request-Id': requestId },
    });
    assert.equal(response.status, 404);

    lifecycleEvents.off('stage', onStage);
    assert.ok(!events.includes('interceptor:after'));
    assert.deepEqual(events, ['middleware', 'guard', 'interceptor:before', 'pipe', 'handler', 'filter']);
  });
});
