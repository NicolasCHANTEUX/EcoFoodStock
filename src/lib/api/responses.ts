import { NextResponse } from "next/server";

export type ApiResponseBody = Record<string, unknown>;

export type ApiResult<TBody extends ApiResponseBody = ApiResponseBody> = {
  body: TBody;
  status?: number;
};

export function apiResult<TBody extends ApiResponseBody>(body: TBody, status?: number): ApiResult<TBody> {
  return { body, status };
}

export function jsonApiResult<TBody extends ApiResponseBody>(result: ApiResult<TBody>) {
  return NextResponse.json(result.body, { status: inferApiStatus(result.body, result.status) });
}

export function inferApiStatus(body: ApiResponseBody, explicitStatus?: number) {
  if (isHttpStatus(explicitStatus)) {
    return explicitStatus;
  }

  if (isHttpStatus(body.status)) {
    return body.status;
  }

  return body.ok === false || typeof body.error === "string" ? 500 : 200;
}

export function isRecord<TRecord extends ApiResponseBody = ApiResponseBody>(value: unknown): value is TRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMissingRpcError(message?: string, code?: string, functionName?: string) {
  const normalizedMessage = message?.toLowerCase() ?? "";
  const normalizedFunctionName = functionName?.toLowerCase();

  return (
    code === "PGRST202" ||
    normalizedMessage.includes("could not find the function") ||
    normalizedMessage.includes("schema cache") ||
    Boolean(normalizedFunctionName && normalizedMessage.includes(normalizedFunctionName))
  );
}

function isHttpStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}
