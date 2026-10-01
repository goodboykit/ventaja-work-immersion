import { withBackend } from "@/server/backend";

export const POST = (request: Request) => withBackend((b) => b.chatApi.ask(request));
