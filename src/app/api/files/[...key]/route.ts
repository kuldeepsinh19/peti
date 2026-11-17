import { container } from "@/composition/container";
import { getActor } from "@/composition/session";
import { PUBLIC_PREFIXES, isSafeKey } from "@/modules/media";

export const dynamic = "force-dynamic";

/**
 * Serves stored photographs through the app. Photographs of published listings are public; those of a
 * listing that is not published (a draft, under review, rejected, paused or suspended) are shown only to its
 * owner, administrators and renters who booked it. Condition-report and dispute photos are private: only the
 * two people in the rental and administrators may see them.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!isSafeKey(key)) return new Response("Not found", { status: 404 });

  let isPublic = PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (key.startsWith("outfits/")) {
    const visibility = await container().listings.photoVisibility(key, getActor);
    if (!visibility) return new Response("Not found", { status: 404 });
    isPublic = visibility === "public";
  } else if (!isPublic) {
    const actor = await getActor();
    if (!actor || !(await container().fileAccess.canView(actor, key))) {
      return new Response("Not found", { status: 404 });
    }
  }

  const object = await container().storage.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": object.contentType,
      // A day, not a year: an owner who removes a photograph (or a listing an admin suspends) should stop
      // being served from browser and CDN caches soon after.
      "Cache-Control": isPublic ? "public, max-age=86400" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
