// Every expected failure is an AppError. The API layer turns it into an HTTP response.
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "validation_error", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, code = "forbidden") {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Invoice not found") {
    super(404, "not_found", message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class UnprocessableError extends AppError {
  constructor(code: string, message: string) {
    super(422, code, message);
  }
}
