import { container } from "@/composition/container";
import { getActor } from "@/composition/session";
import { PUBLIC_PREFIXES, isSafeKey } from "@/modules/media";

export const dynamic = "force-dynamic";

/**
 * Serves stored photographs through the app. Listing photos are public. Condition-report and dispute
 * photos are private: only the two people in the rental and administrators may see them.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!isSafeKey(key)) return new Response("Not found", { status: 404 });

  const isPublic = PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!isPublic) {
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
      "Cache-Control": isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
