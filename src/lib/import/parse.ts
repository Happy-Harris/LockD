/**
 * Cell parsers for imported files (plan PR 7). Pure, and forgiving about the formats real exports
 * use, but never guessing a value out of nothing: a blank or unreadable cell is `undefined`.
 */

/**
 * `110`, `110.5`, `110,5` (decimal comma), `1 234.5`, `1.234,5` and `1,234.5`. When both a dot and a
 * comma appear the last one is the decimal mark. A single comma with one to three digits after it is
 * a decimal comma, which is how a European export writes `110,5` and `0,125`. Blank is `undefined`.
 */
export function parseNumber(raw: string): number | undefined {
  const value = raw.replace(/[\s\u00A0]/g, "");
  if (!value) return undefined;
  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  let cleaned: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? /,/g : /\./g;
    cleaned = value.replace(thousands, "").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const commas = value.split(",").length - 1;
    cleaned =
      commas === 1 && /,\d{1,3}$/.test(value) ? value.replace(",", ".") : value.replace(/,/g, "");
  } else {
    cleaned = value;
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return undefined;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** `1h 5m`, `45m`, `1:05:00`, `1:05`, `90` (minutes) into whole seconds. */
export function parseDuration(raw: string): number | undefined {
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;

  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (clock) {
    const [, a, b, c] = clock;
    return c ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 3600 + Number(b) * 60;
  }

  let seconds = 0;
  let matched = false;
  const unit = (pattern: RegExp, factor: number) => {
    const found = pattern.exec(value);
    if (found?.[1]) {
      seconds += Number(found[1].replace(",", ".")) * factor;
      matched = true;
    }
  };
  unit(/(\d+(?:[.,]\d+)?)\s*h/, 3600);
  unit(/(\d+(?:[.,]\d+)?)\s*m(?!s)/, 60);
  unit(/(\d+(?:[.,]\d+)?)\s*s/, 1);
  if (matched) return Math.round(seconds);

  const bare = parseNumber(value);
  return bare === undefined ? undefined : Math.round(bare * 60);
}

export interface LocalMoment {
  /** The instant, read in this device's time zone. */
  date: Date;
  /** What the file said, as `YYYY-MM-DD HH:mm:ss`. Does not depend on the device's time zone. */
  stamp: string;
  /** `YYYY-MM-DD`. */
  localDate: string;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The wall-clock reading of a date in this device's zone, as `YYYY-MM-DD HH:mm:ss`. */
export function localStampOf(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function moment(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
): LocalMoment | null {
  const date = new Date(y, mo - 1, d, h, mi, s);
  // `new Date(2026, 1, 31)` rolls into March; a date that changed is not the date the file gave.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return {
    date,
    stamp: `${pad(y, 4)}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`,
    localDate: `${pad(y, 4)}-${pad(mo)}-${pad(d)}`,
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date and time as an export writes it, read as the lifter's wall-clock time:
 * `2024-01-15 09:30:00`, `2024-01-15T09:30`, `2024-01-15` (noon), `15/01/2024 09:30` and
 * `15.01.2024` (day first, the way European exports write it), `22 Mar 2025, 20:11` (Hevy).
 * Returns null for anything else, including a day that does not exist. A date-only cell has no
 * time, so it is placed at noon.
 */
export function parseLocalMoment(raw: string): LocalMoment | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (iso) {
    return moment(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      Number(iso[4] ?? 12),
      Number(iso[5] ?? 0),
      Number(iso[6] ?? 0),
    );
  }

  const dayFirst =
    /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (dayFirst) {
    return moment(
      Number(dayFirst[3]),
      Number(dayFirst[2]),
      Number(dayFirst[1]),
      Number(dayFirst[4] ?? 12),
      Number(dayFirst[5] ?? 0),
      Number(dayFirst[6] ?? 0),
    );
  }

  const named =
    /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      value,
    );
  if (named) {
    const month = MONTHS.indexOf(named[2]!.slice(0, 3).toLowerCase());
    if (month < 0) return null;
    return moment(
      Number(named[3]),
      month + 1,
      Number(named[1]),
      Number(named[4] ?? 12),
      Number(named[5] ?? 0),
      Number(named[6] ?? 0),
    );
  }
  return null;
}
