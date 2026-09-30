import { withBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => withBackend((b) => b.companyApi.getMe(request));
