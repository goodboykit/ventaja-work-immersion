import type { Authenticator } from "../auth/authenticator.ts";
import type { CompanyService } from "../services/company-service.ts";
import { parseRegisterCompany } from "../validation/register-company-schema.ts";
import { json, readJsonBody, respond } from "./http.ts";

export class CompanyApi {
  private readonly authenticator: Authenticator;
  private readonly service: CompanyService;

  constructor(authenticator: Authenticator, service: CompanyService) {
    this.authenticator = authenticator;
    this.service = service;
  }

  // GET /api/me: who am I, and which company do I belong to (null until set up)
  getMe(request: Request): Promise<Response> {
    return respond(async () => {
      const identity = await this.authenticator.identify(request);
      return json(200, { data: await this.service.getProfile(identity) });
    });
  }

  // POST /api/company: create my company (only for a user that has none yet)
  registerCompany(request: Request): Promise<Response> {
    return respond(async () => {
      const identity = await this.authenticator.identify(request);
      const input = parseRegisterCompany(await readJsonBody(request));
      return json(201, { data: await this.service.register(identity, input) });
    });
  }
}
