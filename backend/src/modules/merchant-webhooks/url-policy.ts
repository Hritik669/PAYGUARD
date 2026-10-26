import { AppError } from "../../common/errors";

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function assertEndpointUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, "INVALID_ENDPOINT_URL", "Enter an absolute http or https URL.");
  }
  if (url.username || url.password) {
    throw new AppError(400, "INVALID_ENDPOINT_URL", "The endpoint URL cannot contain credentials.");
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (url.protocol === "http:") {
    if (!local) throw new AppError(400, "INVALID_ENDPOINT_URL", "HTTP endpoints are limited to localhost.");
    return url;
  }
  if (url.protocol !== "https:") {
    throw new AppError(400, "INVALID_ENDPOINT_URL", "Endpoint URLs must use https, or http on localhost.");
  }
  if (host === "metadata.google.internal" || host.endsWith(".local") || isPrivateIpv4(host)) {
    throw new AppError(400, "INVALID_ENDPOINT_URL", "The endpoint URL must be a public https address.");
  }
  return url;
}
