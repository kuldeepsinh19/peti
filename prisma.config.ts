import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env on its own; dotenv/config above does it for the CLI.
// `prisma generate` must work without a database (CI install, Docker builds), so the URL
// falls back to a placeholder that is never connected to by generate.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
