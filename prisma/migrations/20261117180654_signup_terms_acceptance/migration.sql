-- AlterTable
ALTER TABLE "users" ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(3),
ADD COLUMN     "terms_version" TEXT;

-- An acceptance always says which version was accepted.
ALTER TABLE "users"
  ADD CONSTRAINT users_terms_acceptance_complete CHECK ((terms_accepted_at IS NULL) = (terms_version IS NULL));
