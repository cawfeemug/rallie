import { randomInt } from 'node:crypto';

// No 0/O, 1/I/L: join codes get read aloud and typed on phones.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export const CODE_ALPHABET = ALPHABET;
