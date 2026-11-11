import "server-only";
import { container } from "@/composition/container";
import type { UserActor } from "@/shared/application/actor";

/** Options for the listing form: active categories and localities, and the owner's own addresses. */
export async function listingFormOptions(actor: UserActor) {
  const { search, users } = container();
  const [categories, localities, addresses] = await Promise.all([
    search.categories(),
    users.listLocalities(),
    users.listAddresses(actor),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    localities: localities.map((l) => ({ id: l.id, name: l.name })),
    addresses: addresses.map((a) => ({
      id: a.id,
      name: `${a.label ?? a.localityName} — ${a.line1}`,
      localityId: a.localityId,
    })),
  };
}
