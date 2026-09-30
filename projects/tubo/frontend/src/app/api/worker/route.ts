import { withBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export const POST = () =>
  withBackend(async (b) => {
    const processed = await b.worker.tick();
    return Response.json({ processed });
  });
