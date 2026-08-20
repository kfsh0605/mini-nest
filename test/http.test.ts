import 'reflect-metadata';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { Container } from '../src/container';
import { createHttpApp } from '../src/dispatcher';
import { UsersController } from '../src/controllers/users.controller';
import { UserService } from '../src/services/user.service';
import { Controller } from '../src/decorators/controller';
import { Get } from '../src/decorators/methods';
import { Injectable } from '../src/decorators/injectable';
import { Param, Query } from '../src/decorators/params';
import { runZodValidationPipe } from '../src/pipes/zod-validation.pipe';
import { CreateUserSchema } from '../src/dto/create-user.dto';
import { ValidationError } from '../src/errors';

const AUTH_HEADER = { Authorization: 'Bearer test-token' };

@Injectable()
@Controller('probe')
class ProbeController {
  @Get('echo/:id')
  echo(@Query('q') q: string, @Param('id') id: string) {
    return { q, id };
  }

  @Get('boom')
  boom(): never {
    throw new Error('boom');
  }
}

let container: Container;
let server: Server;
let baseUrl: string;

describe('HTTP layer (createHttpApp)', () => {
  before(async () => {
    container = new Container();
    const app = createHttpApp([UsersController, ProbeController], container);
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
    const response = await fetch(`${baseUrl}/users`, { headers: AUTH_HEADER });
    assert.equal(response.status, 200);
    const body = (await response.json()) as unknown[];
    assert.equal(body.length, 2);
  });

  it('GET /users?limit=1 подставляет query-параметр через @Query()', async () => {
    const response = await fetch(`${baseUrl}/users?limit=1`, { headers: AUTH_HEADER });
    assert.equal(response.status, 200);
    const body = (await response.json()) as unknown[];
    assert.equal(body.length, 1);
  });

  it('GET /users/:id подставляет динамический сегмент пути через @Param()', async () => {
    const response = await fetch(`${baseUrl}/users/2`, { headers: AUTH_HEADER });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { id: string; name: string };
    assert.equal(body.id, '2');
    assert.equal(body.name, 'Alan Turing');
  });

  it('GET /users/:id с несуществующим id возвращает 404 (NotFoundError из сервиса)', async () => {
    const response = await fetch(`${baseUrl}/users/no-such-id`, { headers: AUTH_HEADER });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { message: string };
    assert.match(body.message, /not found/);
  });

  it('несуществующий маршрут возвращает 404 с понятным сообщением', async () => {
    const response = await fetch(`${baseUrl}/no-such-route`, { headers: AUTH_HEADER });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { message: string };
    assert.match(body.message, /GET/);
  });

  it('POST /users с невалидным телом возвращает 400 и список ошибок по полям', async () => {
    const response = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
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
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Grace Hopper', email: 'grace@example.com', age: 45 }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { id: string; name: string };
    assert.equal(created.name, 'Grace Hopper');

    const getResponse = await fetch(`${baseUrl}/users/${created.id}`, { headers: AUTH_HEADER });
    assert.equal(getResponse.status, 200);
    const fetched = (await getResponse.json()) as { name: string; email: string };
    assert.equal(fetched.name, 'Grace Hopper');
    assert.equal(fetched.email, 'grace@example.com');
  });

  it('порядок @Query()/@Param() в сигнатуре не важен - подстановка идёт по индексу параметра', async () => {
    const response = await fetch(`${baseUrl}/probe/echo/42?q=hello`, { headers: AUTH_HEADER });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { q: string; id: string };
    assert.equal(body.id, '42');
    assert.equal(body.q, 'hello');
  });

  it('exception filter ловит неожиданную ошибку: 500, без текста ошибки и без стека в ответе', async () => {
    const response = await fetch(`${baseUrl}/probe/boom`, { headers: AUTH_HEADER });
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.doesNotMatch(text, /boom/);
    assert.doesNotMatch(text, /at .*\.ts:/);
  });

  it('runZodValidationPipe() возвращает провалидированные данные с правильными типами', () => {
    const value = runZodValidationPipe(CreateUserSchema, {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      age: 36,
    });
    assert.equal(value.name, 'Ada Lovelace');
    assert.equal(typeof value.age, 'number');
  });

  it('runZodValidationPipe() бросает ValidationError на невалидные данные', () => {
    assert.throws(
      () => runZodValidationPipe(CreateUserSchema, { name: 'A', email: 'bad', age: 5 }),
      ValidationError,
    );
  });

  it('guard блокирует запрос без Authorization: 403, и обработчик не вызывается', async () => {
    const userService = container.resolve(UserService);
    const originalList = userService.list.bind(userService);
    let callCount = 0;
    userService.list = ((...args: Parameters<typeof originalList>) => {
      callCount += 1;
      return originalList(...args);
    }) as typeof userService.list;

    const response = await fetch(`${baseUrl}/users`);
    assert.equal(response.status, 403);
    assert.equal(callCount, 0);

    userService.list = originalList;
  });

  it('guard блокирует запрос с Authorization не в формате Bearer', async () => {
    const response = await fetch(`${baseUrl}/users`, { headers: { Authorization: 'Basic abcdef' } });
    assert.equal(response.status, 403);
  });

  it('X-Request-Id: сервер сам генерирует id, если клиент его не прислал', async () => {
    const response = await fetch(`${baseUrl}/users`, { headers: AUTH_HEADER });
    assert.equal(response.status, 200);
    const requestId = response.headers.get('x-request-id');
    assert.ok(requestId && requestId.length > 0);
  });

  it('X-Request-Id: если клиент прислал свой - сервер возвращает именно его', async () => {
    const response = await fetch(`${baseUrl}/users`, {
      headers: { ...AUTH_HEADER, 'X-Request-Id': 'my-own-id-42' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'my-own-id-42');
  });

  it('параллельные запросы не смешивают requestId между собой', async () => {
    const ids = Array.from({ length: 10 }, (_, index) => `concurrent-${index}`);
    const responses = await Promise.all(
      ids.map((id) => fetch(`${baseUrl}/users`, { headers: { ...AUTH_HEADER, 'X-Request-Id': id } })),
    );
    responses.forEach((response, index) => {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-request-id'), ids[index]);
    });
  });
});
