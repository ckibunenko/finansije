import { createHash } from 'node:crypto';
export function passwordHash(password) {
  return 'random-key-sha256:' + createHash('sha256').update(password).digest('hex');
}
