import type { Authenticator } from "../auth/authenticator.ts";
import type { CompanyService } from "../services/company-service.ts";
import { parseAcceptInvite, parseInvite } from "../validation/invite-schema.ts";
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

  // POST /api/invitations: invite a teammate by email (requires an existing company)
  invite(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      const { email } = parseInvite(await readJsonBody(request));
      return json(201, { data: await this.service.invite(auth, email) });
    });
  }

  // GET /api/invitations: list my company's pending invites
  listInvitations(request: Request): Promise<Response> {
    return respond(async () => {
      const auth = await this.authenticator.authenticate(request);
      return json(200, { data: await this.service.listInvitations(auth) });
    });
  }

  // POST /api/invitations/accept: join a company using an invite token (user must have no company yet)
  acceptInvite(request: Request): Promise<Response> {
    return respond(async () => {
      const identity = await this.authenticator.identify(request);
      const { token } = parseAcceptInvite(await readJsonBody(request));
      return json(200, { data: await this.service.acceptInvite(identity, token) });
    });
  }
}
