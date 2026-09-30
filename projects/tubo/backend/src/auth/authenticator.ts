// A caller with a valid login, whether or not they have set up a company yet.
export interface Identity {
  userId: string;
  email: string | null;
}

// A caller with a valid login who belongs to a company. Invoice endpoints require this.
export interface AuthContext {
  userId: string;
  companyId: string;
}

export interface Authenticator {
  // Throws UnauthorizedError when the token is missing, invalid or expired.
  identify(request: Request): Promise<Identity>;
  // Also throws ForbiddenError when the user has no company yet.
  authenticate(request: Request): Promise<AuthContext>;
}
