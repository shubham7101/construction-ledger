import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string({ message: "DATABASE_URL environment variable is required" })
    .min(1, "DATABASE_URL environment variable cannot be empty"),
  JWT_SECRET: z
    .string({ message: "JWT_SECRET environment variable is required" })
    .min(
      32,
      "JWT_SECRET environment variable must be at least 32 characters long according to cryptographic standards",
    ),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
});
