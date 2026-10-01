import type { Authenticator } from "../auth/authenticator.ts";
import type { ChatService } from "../services/chat-service.ts";
import { parseChatMessage } from "../validation/chat-message-schema.ts";
import { json, readJsonBody, respond } from "./http.ts";

export class ChatApi {
  private readonly authenticator: Authenticator;
  private readonly chat: ChatService;

  constructor(authenticator: Authenticator, chat: ChatService) {
    this.authenticator = authenticator;
    this.chat = chat;
  }

  ask(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      const { message } = parseChatMessage(await readJsonBody(request));
      const result = await this.chat.ask(auth, message);
      return json(200, { data: result });
    });
  }
}

export class UnavailableChatApi {
  ask(_request: Request): Promise<Response> {
    return Promise.resolve(
      json(503, { error: { code: "chat_unavailable", message: "The AI assistant is not configured. Add GEMINI_API_KEY to enable it." } }),
    );
  }
}
