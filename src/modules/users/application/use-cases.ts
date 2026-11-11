import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";
import { NotFoundError, PreconditionError, ValidationError } from "@/shared/domain/errors";
import { parseInput } from "@/shared/contracts/validation";
import { addressIdSchema, addressSchema, payoutAccountSchema, updateProfileSchema } from "./contracts";
import type { AccountOverview, AddressView, UserRepository } from "./ports";

export const MAX_ADDRESSES = 5;

export interface UsersDeps {
  users: UserRepository;
}

/**
 * Account use cases. Every function takes the actor first and only ever touches that actor's own rows,
 * so one user can never read or change another user's profile or addresses.
 */
export function usersUseCases({ users }: UsersDeps) {
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
      if ((await users.countAddresses(user.userId)) >= MAX_ADDRESSES) {
        throw new PreconditionError("ADDRESS_LIMIT", `You can keep up to ${MAX_ADDRESSES} addresses.`);
      }
      return users.addAddress(user.userId, data);
    },

    async removeAddress(actor: Actor, input: unknown): Promise<void> {
      const user = requireUser(actor);
      const { addressId } = parseInput(addressIdSchema, input);
      if (!(await users.removeAddress(user.userId, addressId))) throw new NotFoundError("Address");
    },

    async setDefaultAddress(actor: Actor, input: unknown): Promise<void> {
      const user = requireUser(actor);
      const { addressId } = parseInput(addressIdSchema, input);
      if (!(await users.setDefaultAddress(user.userId, addressId))) throw new NotFoundError("Address");
    },

    async savePayoutAccount(actor: Actor, input: unknown): Promise<void> {
      const user = requireUser(actor);
      await users.upsertPayoutAccount(user.userId, parseInput(payoutAccountSchema, input));
    },

    listLocalities: () => users.listLocalities(),
  };
}

export type UsersUseCases = ReturnType<typeof usersUseCases>;
