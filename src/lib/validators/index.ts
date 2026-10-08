import { z } from "zod";
import { digits, iso } from "@/lib/format";
import { normalizeName } from "@/lib/normalize";

export const loginSchema = z.object({
  mobile: z
    .string()
    .trim()
    .length(10, "Mobile number must be exactly 10 digits")
    .regex(/^\d+$/, "Mobile number must contain only numbers"), // <-- Adds numeric-only validation
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

export const ledgerEntrySchema = z.object({
  personId: z.number().int().positive("Invalid person"),
  type: z.enum(["credit", "debit"]),
  amount: z.number().int().positive("Amount must be greater than 0"),
  date: z
    .string()
    .transform((val) => (val.includes("/") ? iso(val) : val))
    .refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), "Invalid date format"),
  siteId: z.number().int().nullable().optional().default(null),
  categoryId: z.number().int().positive("Category is required"),
  mode: z.enum(["cash", "upi", "bank_transfer", "cheque"]),
  note: z.string().default(""),
});

export const expenseSchema = z.object({
  amount: z.number().int().positive("Amount must be greater than 0"),
  date: z
    .string()
    .transform((val) => (val.includes("/") ? iso(val) : val))
    .refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), "Invalid date format"),
  siteId: z.number().int().positive("Site is required"),
  categoryId: z.number().int().positive("Category is required"),
  note: z.string().default(""),
});

export const personSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  // Clean formatting first ("(+91) 90000 00002" → 10 digits), then validate.
  mobile: z
    .string()
    .trim()
    .transform(digits)
    .refine(
      (val) => val.length === 10,
      "Indian mobile numbers must be exactly 10 digits",
    ),
  // Optional second number: blank, or 10 digits after cleaning.
  mobile2: z
    .string()
    .trim()
    .transform(digits)
    .refine(
      (val) => val === "" || val.length === 10,
      "Second mobile must be 10 digits (or left blank)",
    )
    .default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (val) => val === "" || z.email().safeParse(val).success,
      "Enter a valid email (or leave it blank)",
    )
    .default(""),
  address: z.string().trim().max(300, "Address is too long").default(""),
  personTypeId: z.number().int().positive("Person type is required"),
});

export const siteSchema = z.object({
  name: z.string().trim().min(1, "Site name is required"),
  address: z.string().trim().max(300, "Address is too long").default(""),
  state: z.string().trim().default(""),
  status: z.enum(["active", "completed", "on_hold"]).default("active"),
  city: z.string().trim().default(""),
});

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .transform(normalizeName),
});

export const personTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Person type name is required")
    .transform(normalizeName),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  // Clean formatting first, then validate the digits (see personSchema).
  mobile: z
    .string()
    .trim()
    .transform(digits)
    .refine(
      (val) => val.length === 10,
      "Indian mobile numbers must be exactly 10 digits",
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "regular"]).default("regular"),
});

export const updateUserSchema = createUserSchema.extend({
  // Blank (or omitted) keeps the current password.
  password: z
    .union([
      z.literal(""),
      z.string().min(8, "Password must be at least 8 characters"),
    ])
    .optional(),
  role: z.enum(["admin", "regular"]),
});

/** Your own name and mobile (Profile → Edit profile). */
export const profileSchema = createUserSchema.pick({
  name: true,
  mobile: true,
});

export const changePasswordSchema = z.object({
  current: z.string().min(1, "Enter your current password"),
  next: z.string().min(8, "Password must be at least 8 characters"),
});
