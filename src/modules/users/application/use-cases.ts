import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";
import { NotFoundError, PreconditionError, ValidationError } from "@/shared/domain/errors";
import { parseInput } from "@/shared/contracts/validation";
import { addressIdSchema, addressSchema, payoutAccountSchema, updateProfileSchema } from "./contracts";
import type { AccountOverview, AddressView, UserRepository } from "./ports";
import type { AuditLog } from "@/shared/application/audit";

export const MAX_ADDRESSES = 5;

export interface UsersDeps {
  users: UserRepository;
  /** Payout account changes are audited and the account holder is told (a hijacked session cannot
   *  silently redirect payouts). Optional so read-only callers need not provide them. */
  audit?: AuditLog;
  notifications?: NotificationEnqueuer;
}

type NotificationEnqueuer = {
  enqueue(
    drafts: ReadonlyArray<{
      userId: string;
      type: string;
      subject: string;
      body: string;
      link?: string;
      dedupeKey: string;
      channels: ReadonlyArray<"IN_APP" | "EMAIL">;
    }>,
  ): Promise<void>;
};

/**
 * Account use cases. Every function takes the actor first and only ever touches that actor's own rows,
 * so one user can never read or change another user's profile or addresses.
 */
export function usersUseCases({ users, audit, notifications }: UsersDeps) {
  return {
    async getAccount(actor: Actor): Promise<AccountOverview> {
      const user = requireUser(actor);
      const overview = await users.getAccountOverview(user.userId);
      if (!overview) throw new NotFoundError("Account");
      return overview;
    },

    async updateProfile(actor: Actor, input: unknown): Promise<void> {
      const user = requireUser(actor);
      await users.updateProfile(user.userId, parseInput(updateProfileSchema, input));
    },

    async listAddresses(actor: Actor): Promise<AddressView[]> {
      return users.listAddresses(requireUser(actor).userId);
    },

    async addAddress(actor: Actor, input: unknown): Promise<AddressView> {
      const user = requireUser(actor);
      const data = parseInput(addressSchema, input);
      if (!(await users.localityExists(data.localityId))) {
        throw new ValidationError("Please check the highlighted fields.", {
          localityId: ["Choose a locality."],
        });
      }
      const added = await users.addAddress(user.userId, data, MAX_ADDRESSES);
      if (added === "LIMIT") {
        throw new PreconditionError("ADDRESS_LIMIT", `You can keep up to ${MAX_ADDRESSES} addresses.`);
      }
      return added;
    },

    async removeAddress(actor: Actor, input: unknown): Promise<void> {
      const user = requireUser(actor);
      const { addressId } = parseInput(addressIdSchema, input);
      // A removed address would still be shared with renters of the listings that collect from it.
      if (await users.addressInUse(addressId)) {
        throw new PreconditionError(
          "ADDRESS_IN_USE",
          "One of your listings is collected from this address. Choose another pickup address for it first.",
        );
      }
      if (!(await users.removeAddress(user.userId, addressId))) throw new NotFoundError("Address");
    },

    async setDefaultAddress(actor: Actor, input: unknown): Promise<void> {
      const user = requireUser(actor);
      const { addressId } = parseInput(addressIdSchema, input);
      if (!(await users.setDefaultAddress(user.userId, addressId))) throw new NotFoundError("Address");
    },

    async savePayoutAccount(actor: Actor, input: unknown): Promise<void> {
      const user = requireUser(actor);
      const data = parseInput(payoutAccountSchema, input);
      await users.upsertPayoutAccount(user.userId, data);
      await audit?.record({
        actorUserId: user.userId,
        actorRole: "OWNER",
        action: "user.payoutAccount",
        entityType: "user",
        entityId: user.userId,
        after: { upiVpa: data.upiVpa, accountHolderName: data.accountHolderName },
      });
      const at = Date.now();
      await notifications?.enqueue([
        {
          userId: user.userId,
          type: "account.payoutAccountChanged",
          subject: "Your payout UPI ID was changed",
          body: `Payouts will now go to ${data.upiVpa}. If you did not make this change, sign in, change your password and contact Peti straight away.`,
          link: "/lend/earnings",
          dedupeKey: `payout-account:${user.userId}:${at}`,
          channels: ["IN_APP", "EMAIL"],
        },
      ]);
    },

    listLocalities: () => users.listLocalities(),
  };
}

export type UsersUseCases = ReturnType<typeof usersUseCases>;
