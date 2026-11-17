import type { Actor } from "@/shared/application/actor";
import { requireUser } from "@/shared/application/authorization";
import type { Clock } from "@/shared/domain/clock";
import { NotFoundError } from "@/shared/domain/errors";
import { localDateInIndia } from "@/shared/domain/local-date";
import { z } from "zod";
import { parseInput } from "@/shared/contracts/validation";
import { exploreQuerySchema } from "./contracts";
import type { CatalogueQueries, OutfitDetail } from "./ports";

export function searchUseCases({ catalogue, clock }: { catalogue: CatalogueQueries; clock: Clock }) {
  return {
    /** Never throws on bad input: unknown or malformed filters are ignored. */
    explore(searchParams: Record<string, string | string[] | undefined>) {
      const query = exploreQuerySchema.parse(searchParams);
      const today = localDateInIndia(clock.now());
      return {
        query,
        result: catalogue.explore(query, today),
        // The date filter only applies to future start dates: only then is every result free on them.
        datesChecked: query.from !== undefined && query.from > today,
      };
    },

    /**
     * Live listings are public. Drafts and listings under review are visible only to the owner and admins;
     * listings of a suspended owner only to admins.
     */
    async outfit(actor: Actor | null, slug: string): Promise<OutfitDetail> {
      const outfit = await catalogue.outfitBySlug(slug);
      if (!outfit) throw new NotFoundError("Outfit");
      const isOwner = actor?.kind === "user" && actor.userId === outfit.owner.id;
      const isAdmin = actor?.kind === "user" && actor.isAdmin;
      if (isAdmin) return outfit;
      if (outfit.owner.suspended || (outfit.status !== "ACTIVE" && !isOwner))
        throw new NotFoundError("Outfit");
      return outfit;
    },

    /** Saves or removes an outfit. The form says which (the state the user saw), so repeating it is harmless. */
    async setSaved(actor: Actor, input: unknown): Promise<void> {
      const user = requireUser(actor);
      const { outfitId, save } = parseInput(
        z.object({ outfitId: z.uuid(), save: z.enum(["1", "0"]) }),
        input,
      );
      if (save === "0") return catalogue.unsave(user.userId, outfitId);
      if (!(await catalogue.save(user.userId, outfitId))) throw new NotFoundError("Outfit");
    },

    saved: (actor: Actor) => catalogue.savedOutfits(requireUser(actor).userId),
    savedIds: (actor: Actor | null) =>
      actor?.kind === "user" ? catalogue.savedOutfitIds(actor.userId) : Promise.resolve(new Set<string>()),
    categories: () => catalogue.categories(),
    localities: () => catalogue.localities(),
    recentlyListed: (limit = 6) => catalogue.recentlyListed(limit),
  };
}

export type SearchUseCases = ReturnType<typeof searchUseCases>;
