import { Injectable } from '../decorators/injectable';
import { CreateUserDto } from '../dto/create-user.dto';

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

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  list(limit?: number): User[] {
    const all = Array.from(this.users.values());
    return limit !== undefined ? all.slice(0, limit) : all;
  }

  create(dto: CreateUserDto): User {
    const id = String(this.nextId++);
    const user: User = { id, name: dto.name, email: dto.email, age: dto.age };
    this.users.set(id, user);
    return user;
  }
}
