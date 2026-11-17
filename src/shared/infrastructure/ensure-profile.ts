import "server-only";
import type { DbOrTx } from "./prisma";

/**
 * Creates a member's profile row if it is missing, from their account name. Every account gets one at
 * sign-up, but accounts created before sign-up validated names could be left without one (the profile's
 * display-name CHECK refused a one-character name after the account had already been saved). Counters and
 * rating aggregates are kept on the profile, so writers call this before updating it.
 */
export async function ensureProfile(db: DbOrTx, userId: string): Promise<void> {
  await db.$executeRaw`
    INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
    SELECT u.id,
           CASE WHEN char_length(btrim(u.name)) BETWEEN 2 AND 60 THEN btrim(u.name) ELSE 'Peti member' END,
           now(), now()
    FROM users u
    WHERE u.id = ${userId}::uuid
    ON CONFLICT (user_id) DO NOTHING`;
}
