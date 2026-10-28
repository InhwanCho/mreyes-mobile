export const CALENDAR_START =
  "/api/v1/integrations/google-calendar/mobile/start";
export const CALENDAR_RETURN = "mreyes://calendar/complete";

export function validatedOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "EXPO_PUBLIC_APP_URL must be an HTTPS origin without a path.",
    );
  }
  return url.origin;
}

export function isTrustedPage(value: string, origin: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isCalendarStart(value: string, origin: string): boolean {
  if (!isTrustedPage(value, origin)) return false;
  const url = new URL(value);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return (
    url.pathname === CALENDAR_START &&
    !url.search &&
    fragment.size === 1 &&
    /^[A-Za-z0-9_-]{43}$/.test(fragment.get("ticket") ?? "")
  );
}

export function isCalendarReturn(value: string): boolean {
  // A deep link is only a signal to refetch; no supplied state or tokens are trusted.
  return value === CALENDAR_RETURN || value === `${CALENDAR_RETURN}/`;
}

export function navigationAction(
  value: string,
  origin: string,
): "internal" | "external" | "calendar" | "blocked" {
  try {
    const url = new URL(value);
    if (url.username || url.password) return "blocked";
    if (isCalendarStart(value, origin)) return "calendar";
    if (isTrustedPage(value, origin)) {
      if (url.pathname.startsWith("/api/v1/integrations/google-calendar/"))
        return "blocked";
      return "internal";
    }
    // Never continue OAuth that was accidentally initiated inside the WebView.
    if (url.hostname === "accounts.google.com") return "blocked";
    if (["https:", "mailto:", "tel:"].includes(url.protocol)) return "external";
    return "blocked";
  } catch {
    return "blocked";
  }
}

export const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export function parseSharedFile(
  value: unknown,
): { base64: string; name: string; mime: string } | null {
  if (!value || typeof value !== "object") return null;
  const file = value as Record<string, unknown>;
  if (
    typeof file.base64 !== "string" ||
    typeof file.mime !== "string" ||
    !Object.hasOwn(FILE_TYPES, file.mime)
  )
    return null;
  if (
    !file.base64.length ||
    file.base64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
    file.base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)
  )
    return null;
  const rawName = typeof file.name === "string" ? file.name : "MReyes";
  const stem =
    rawName
      .replace(/\.[^.]*$/, "")
      .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
      .slice(0, 80) || "MReyes";
  return {
    base64: file.base64,
    mime: file.mime,
    name: `${stem}.${FILE_TYPES[file.mime]}`,
  };
}
