import type { Metadata } from "next";
import { container } from "@/composition/container";
import { requireActorOrRedirect } from "@/composition/session";
import { MAX_ADDRESSES } from "@/modules/users";
import { AddressForm } from "@/modules/users/ui/account-forms";
import { SubmitButton } from "@/shared/ui/submit-button";
import { EmptyState, Tag } from "@/shared/ui/feedback";
import { PageHeader, SectionIndex } from "@/shared/ui/layout";
import { addAddressAction, removeAddressAction, setDefaultAddressAction } from "../actions";

export const metadata: Metadata = { title: "Addresses" };

export default async function AddressesPage() {
  const actor = await requireActorOrRedirect("/account/addresses");
  const { users } = container();
  const [addresses, localities] = await Promise.all([users.listAddresses(actor), users.listLocalities()]);

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Pickup and return"
        title="Addresses"
        lede="Where owners hand over outfits. Only your locality appears on listings; the full address is shared with the other person once a booking is paid."
      />
      <section aria-label="Saved addresses" className="mt-10">
        {addresses.length === 0 ? (
          <EmptyState title="No addresses yet.">Add one below before you list your first outfit.</EmptyState>
        ) : (
          <ul className="border-t border-ink">
            {addresses.map((a) => (
              <li
                key={a.id}
                className="grid gap-3 border-b border-rule py-5 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div>
                  <p className="flex flex-wrap items-center gap-3 font-display text-xl">
                    {a.label ?? a.localityName}
                    {a.isDefault ? <Tag tone="brand">Default</Tag> : null}
                  </p>
                  <p className="text-sm text-graphite">
                    {[a.line1, a.line2, a.landmark, `${a.localityName}, ${a.city} ${a.pincode}`]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                <div className="flex gap-4">
                  {!a.isDefault ? (
                    <form action={setDefaultAddressAction}>
                      <input type="hidden" name="addressId" value={a.id} />
                      <SubmitButton variant="quiet">Make default</SubmitButton>
                    </form>
                  ) : null}
                  <form action={removeAddressAction}>
                    <input type="hidden" name="addressId" value={a.id} />
                    <SubmitButton variant="quiet">Remove</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {addresses.length < MAX_ADDRESSES ? (
        <section aria-labelledby="add-address" className="mt-16 max-w-3xl">
          <SectionIndex>New address</SectionIndex>
          <h2 id="add-address" className="mt-3 mb-8 text-display-sm">
            Add an address
          </h2>
          <AddressForm localities={localities} action={addAddressAction} />
        </section>
      ) : null}
    </div>
  );
}
