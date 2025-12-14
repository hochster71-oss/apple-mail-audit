export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonError(e: unknown, requestId?: string) {
  if (e instanceof HttpError) {
    return Response.json(
      { error: e.code, message: e.message, requestId },
      { status: e.status }
    );
  }

  const message = e instanceof Error ? e.message : "Unknown error";
  return Response.json(
    { error: "INTERNAL_ERROR", message, requestId },
    { status: 500 }
  );
}
