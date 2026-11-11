// Integration tests run against DATABASE_URL_TEST (see docs/development/testing-guide.md).
import "dotenv/config";

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error("DATABASE_URL_TEST is not set. Copy .env.example to .env and start Postgres.");
}
process.env.DATABASE_URL = url;
process.env.APP_ENV = "test";
