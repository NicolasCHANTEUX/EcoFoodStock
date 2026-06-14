import type { BadgeTone } from "@/types/domain";

const DAY_MS = 86_400_000;

type ExpirationTone = Extract<BadgeTone, "red" | "orange">;

export type ExpirationStatus = {
  label: string;
  tone: ExpirationTone;
};

export function formatExpirationLabel(expirationDate?: string, now = new Date()) {
  const diffDays = daysUntilExpiration(expirationDate, now);

  if (diffDays === null) {
    return undefined;
  }

  if (diffDays <= 0) {
    return "Expire aujourd'hui";
  }

  if (diffDays === 1) {
    return "Expire demain";
  }

  if (diffDays <= 3) {
    return `Expire dans ${diffDays} jours`;
  }

  const parsedDate = parseDateOnly(expirationDate);

  if (!parsedDate) {
    return undefined;
  }

  return `Expire le ${String(parsedDate.day).padStart(2, "0")}/${String(parsedDate.month).padStart(2, "0")}/${parsedDate.year}`;
}

export function getExpirationStatus(expirationDate?: string, now = new Date()): ExpirationStatus | undefined {
  const diffDays = daysUntilExpiration(expirationDate, now);

  if (diffDays === null) {
    return undefined;
  }

  if (diffDays <= 0) {
    return { label: "DLC aujourd'hui", tone: "red" };
  }

  if (diffDays === 1) {
    return { label: "DLC demain", tone: "orange" };
  }

  if (diffDays <= 3) {
    return { label: "DLC proche", tone: "orange" };
  }

  return undefined;
}

export function daysUntilExpiration(expirationDate?: string, now = new Date()) {
  const parsedDate = parseDateOnly(expirationDate);

  if (!parsedDate) {
    return null;
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const expiration = new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day);
  return Math.round((expiration.getTime() - today.getTime()) / DAY_MS);
}

function parseDateOnly(value?: string) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return { year, month, day };
}
