// src/server/auth/password.ts
import bcrypt from "bcryptjs";
import "server-only";

const SALT_ROUNDS = 10;

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, SALT_ROUNDS);

export const verifyPassword = (
  password: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(password, hash);
