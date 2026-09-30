import { withBackend } from "@/server/backend";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => withBackend((b) => b.companyApi.registerCompany(request));
