import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingPhoto } from "@/modules/listings";
import { PhotoManager } from "@/modules/listings/ui/photo-manager";
import type { ActionResult } from "@/shared/contracts/action-result";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: ImgHTMLAttributes<HTMLImageElement>) => <img src={String(src)} alt={alt} />,
}));
// The browser resize is a convenience the server does not rely on; here it passes files through.
vi.mock("@/shared/ui/downscale-image", () => ({ downscaleImage: async (file: File) => file }));

const photo = (id: string, i: number): ListingPhoto => ({
  id,
  storageKey: `outfits/o1/${id}.jpg`,
  altText: `Photo ${i}`,
  width: 900,
  height: 1200,
  sortOrder: i,
});
const jpeg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });
const ok = async (_data: FormData): Promise<ActionResult<undefined>> => ({ ok: true, data: undefined });

function setup(photos: ListingPhoto[] = [], overrides: Partial<Parameters<typeof PhotoManager>[0]> = {}) {
  const upload = vi.fn(async (data: FormData): Promise<ActionResult<{ id: string }>> =>
    (data.get("photo") as File).name === "refused.jpg"
      ? { ok: false, error: { code: "INVALID_IMAGE", message: "That file is not a photograph we can use." } }
      : { ok: true, data: { id: "new" } },
  );
  const remove = vi.fn(ok);
  const makeCover = vi.fn(ok);
  render(
    <PhotoManager
      outfitId="o1"
      photos={photos}
      upload={upload}
      remove={remove}
      makeCover={makeCover}
      {...overrides}
    />,
  );
  return { upload, remove, makeCover, user: userEvent.setup({ applyAccept: false }) };
}

beforeEach(() => {
  refresh.mockClear();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("PhotoManager", () => {
  it("uploads several photographs one after another and reports each one", async () => {
    const { upload, user } = setup();
    await user.upload(screen.getByLabelText("Choose photographs"), [
      jpeg("front.jpg"),
      jpeg("refused.jpg"),
      jpeg("back.jpg"),
    ]);

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    const sent = upload.mock.calls.map(([data]) => (data.get("photo") as File).name);
    expect(sent).toEqual(["front.jpg", "refused.jpg", "back.jpg"]);
    expect(upload.mock.calls[0]![0].get("outfitId")).toBe("o1");

    // Successful uploads leave the queue (the refreshed page shows them); the refusal stays, with its reason.
    const uploads = await screen.findByRole("list", { name: "Uploads" });
    await waitFor(() => expect(within(uploads).getAllByRole("listitem")).toHaveLength(1));
    expect(within(uploads).getByText("refused.jpg")).toBeInTheDocument();
    expect(within(uploads).getByText("That file is not a photograph we can use.")).toBeInTheDocument();
    expect(within(uploads).getByRole("status")).toHaveTextContent("Not added");
    expect(refresh).toHaveBeenCalled();
  });

  it("refuses files that are not JPEG, PNG or WebP before uploading anything", async () => {
    const { upload, user } = setup();
    await user.upload(screen.getByLabelText("Choose photographs"), [
      new File(["%PDF"], "invoice.pdf", { type: "application/pdf" }),
    ]);
    expect(await screen.findByText("Use a JPEG, PNG or WebP photograph.")).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("marks the first photograph as the cover and lets another become the cover", async () => {
    const { makeCover, user } = setup([photo("p1", 0), photo("p2", 1)]);
    const grid = screen.getByRole("list", { name: "Photographs" });
    expect(within(grid).getAllByRole("listitem")[0]).toHaveTextContent("Cover");
    expect(screen.queryByRole("button", { name: "Make photo 1 the cover" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Make photo 2 the cover" }));
    expect(makeCover).toHaveBeenCalledTimes(1);
    const sent = makeCover.mock.calls[0]![0];
    expect([sent.get("outfitId"), sent.get("photoId")]).toEqual(["o1", "p2"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("removes a photograph", async () => {
    const { remove, user } = setup([photo("p1", 0), photo("p2", 1)]);
    await user.click(screen.getByRole("button", { name: "Remove photo 2" }));
    expect(remove.mock.calls[0]![0].get("photoId")).toBe("p2");
  });

  it("only offers the room that is left, and explains when uploads are not possible here", async () => {
    const eight = Array.from({ length: 8 }, (_, i) => photo(`p${i}`, i));
    setup(eight);
    expect(screen.queryByLabelText("Choose photographs")).toBeNull();
    expect(screen.getByText(/maximum of 8 photographs/)).toBeInTheDocument();

    setup([], { uploadsDisabledReason: "Photo upload isn't available in the public demo." });
    expect(screen.getByText("Photo upload isn't available in the public demo.")).toBeInTheDocument();
  });
});
