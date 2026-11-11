import { toNextJsHandler } from "better-auth/next-js";
import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

const handler = () => toNextJsHandler(container().auth);

export const GET = (request: Request) => handler().GET(request);
export const POST = (request: Request) => handler().POST(request);
