import { withBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => withBackend((b) => b.companyApi.invite(request));
export const GET = (request: Request) => withBackend((b) => b.companyApi.listInvitations(request));
