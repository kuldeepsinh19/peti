"use client";

import { adminClient, phoneNumberClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser client for Better Auth's endpoints under /api/auth. Same origin, so no baseURL is needed. */
export const authClient = createAuthClient({
  plugins: [phoneNumberClient(), adminClient()],
});
