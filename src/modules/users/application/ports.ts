import type { AddressInput, PayoutAccountInput, UpdateProfileInput } from "./contracts";

export interface AddressView {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  localityId: string;
  localityName: string;
  city: string;
  pincode: string;
  isDefault: boolean;
}

export interface AccountOverview {
  userId: string;
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneVerified: boolean;
  identityVerification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  displayName: string;
  bio: string | null;
  memberSince: Date;
  ownerRating: { average: number | null; count: number };
  renterRating: { average: number | null; count: number };
  payoutAccount: { upiVpa: string; accountHolderName: string } | null;
  counts: { outfits: number; rentals: number; lendings: number };
}

export interface LocalityOption {
  id: string;
  name: string;
  city: string;
}

export interface UserRepository {
  getAccountOverview(userId: string): Promise<AccountOverview | null>;
  updateProfile(userId: string, input: UpdateProfileInput): Promise<void>;
  listAddresses(userId: string): Promise<AddressView[]>;
  countAddresses(userId: string): Promise<number>;
  addAddress(userId: string, input: AddressInput): Promise<AddressView>;
  /** Soft-deletes; returns false when the address does not belong to the user. */
  removeAddress(userId: string, addressId: string): Promise<boolean>;
  setDefaultAddress(userId: string, addressId: string): Promise<boolean>;
  upsertPayoutAccount(userId: string, input: PayoutAccountInput): Promise<void>;
  localityExists(localityId: string): Promise<boolean>;
  listLocalities(): Promise<LocalityOption[]>;
}
