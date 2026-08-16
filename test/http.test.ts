import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { Container } from '../src/container';
import { createHttpApp } from '../src/dispatcher';
import { UsersController } from '../src/controllers/users.controller';

let server: Server;
let baseUrl: string;

describe('HTTP layer (createHttpApp)', () => {
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

  it('GET /users возвращает полный список пользователей без query-параметров', async () => {
    const response = await fetch(`${baseUrl}/users`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as unknown[];
    assert.equal(body.length, 2);
  });

  it('GET /users?limit=1 подставляет query-параметр через @Query()', async () => {
    const response = await fetch(`${baseUrl}/users?limit=1`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as unknown[];
    assert.equal(body.length, 1);
  });

  it('GET /users/:id подставляет динамический сегмент пути через @Param()', async () => {
    const response = await fetch(`${baseUrl}/users/2`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { id: string; name: string };
    assert.equal(body.id, '2');
    assert.equal(body.name, 'Alan Turing');
  });

  it('несуществующий маршрут возвращает 404 с понятным сообщением', async () => {
    const response = await fetch(`${baseUrl}/no-such-route`);
    assert.equal(response.status, 404);
    const body = (await response.json()) as { message: string };
    assert.match(body.message, /GET/);
  });

  it('POST /users с невалидным телом возвращает 400 и список ошибок по полям', async () => {
    const response = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A', email: 'not-an-email', age: 5 }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { errors: { field: string; constraints: string[] }[] };
    const fields = body.errors.map((e) => e.field);
    assert.ok(fields.includes('email'));
    assert.ok(fields.includes('age'));
  });

  it('POST /users с валидным телом создаёт пользователя, и он виден в последующем GET (доказывает singleton)', async () => {

    const createResponse = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Grace Hopper', email: 'grace@example.com', age: 45 }),
    });
    // 201 - успешное создание
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { id: string; name: string };
    assert.equal(created.name, 'Grace Hopper');

    const getResponse = await fetch(`${baseUrl}/users/${created.id}`);
    assert.equal(getResponse.status, 200);
    const fetched = (await getResponse.json()) as { name: string; email: string };
    assert.equal(fetched.name, 'Grace Hopper');
    assert.equal(fetched.email, 'grace@example.com');
  });
});
