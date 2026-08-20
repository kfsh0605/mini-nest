import { Injectable } from '../decorators/injectable';
import { getCurrentRequestId } from '../context/request-context';
import { NotFoundError } from '../errors';
import { CreateUserInput } from '../dto/create-user.dto';

export interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

@Injectable()
export class UserService {
  private users = new Map<string, User>([
    ['1', { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', age: 36 }],
    ['2', { id: '2', name: 'Alan Turing', email: 'alan@example.com', age: 41 }],
  ]);
  private nextId = 3;

  findById(id: string): User {
    console.log(`[${getCurrentRequestId()}] UserService.findById(${id})`);
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundError(`User ${id} not found`);
    }
    return user;
  }

  list(limit?: number): User[] {
    console.log(`[${getCurrentRequestId()}] UserService.list(limit=${limit ?? 'none'})`);
    const all = Array.from(this.users.values());
    return limit !== undefined ? all.slice(0, limit) : all;
  }

  create(data: CreateUserInput): User {
    console.log(`[${getCurrentRequestId()}] UserService.create`);
    const id = String(this.nextId++);
    const user: User = { id, ...data };
    this.users.set(id, user);
    return user;
  }
}
