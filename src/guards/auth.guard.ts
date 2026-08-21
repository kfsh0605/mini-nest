import { IncomingMessage } from 'node:http';

export function authGuard(req: IncomingMessage): boolean {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') {
    return false;
  }
  const prefix = 'Bearer ';
  return header.startsWith(prefix) && header.length > prefix.length;
}
