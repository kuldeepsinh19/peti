import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ObjectStorage } from "../application/ports";
import { isSafeKey } from "../application/ports";

function assertKey(key: string) {
  if (!isSafeKey(key)) throw new Error(`Refusing unsafe storage key: ${key}`);
}

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Development default: files under STORAGE_FS_ROOT. Keys are validated so nothing escapes the root. */
export function filesystemStorage(root: string): ObjectStorage {
  const base = path.resolve(root);
  const resolve = (key: string) => {
    assertKey(key);
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error("Storage key escapes the storage root");
    return full;
  };
  return {
    async put(key, body) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async get(key) {
      try {
        const body = await readFile(resolve(key));
        return {
          body: new Uint8Array(body),
          contentType: TYPES[path.extname(key)] ?? "application/octet-stream",
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string | undefined;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Any S3-compatible service (AWS S3, Cloudflare R2, RustFS, SeaweedFS…). */
export function s3Storage(config: S3Config): ObjectStorage {
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    async put(key, body, contentType) {
      assertKey(key);
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async get(key) {
      assertKey(key);
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        if (!out.Body) return null;
        return {
          body: await out.Body.transformToByteArray(),
          contentType: out.ContentType ?? "application/octet-stream",
        };
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return null;
        throw error;
      }
    },
    async delete(key) {
      assertKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
