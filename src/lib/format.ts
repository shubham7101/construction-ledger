export const fmt = (n: number): string =>
  `₹${Math.abs(n).toLocaleString("en-IN")}`;

export const rs = (n: number): string =>
  `Rs. ${Math.abs(n).toLocaleString("en-IN")}`;

export const today = (): string => {
  const t = new Date();
  return (
    String(t.getDate()).padStart(2, "0") +
    "/" +
    String(t.getMonth() + 1).padStart(2, "0") +
    "/" +
    t.getFullYear()
  );
};

export const todayIso = (): string => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

export const displayDate = (d: string): string => {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  return d;
};

export const iso = (d: string): string => {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [day, m, y] = d.split("/");
    return `${y}-${m}-${day}`;
  }
  return d;
};

export const isoToParts = (d: string): [string, string, string] => {
  if (!d) return ["", "", ""];
  const cleanIso = iso(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanIso)) {
    const [y, m, day] = cleanIso.split("-");
    return [day, m, y];
  }
  return ["", "", ""];
};

export const partsToIso = (day: string, m: string, y: string): string => {
  if (day && m && y) {
    return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return "";
};

export const dstr = (a: [string, string, string]): string =>
  a[0] && a[1] && a[2] ? `${a[0]}/${a[1]}/${a[2]}` : "";

export const digits = (x: string): string => {
  const d = x.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
};

const IST_DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * An SQLite UTC timestamp ("2026-10-08 06:30:00") in India time, e.g.
 * "08 Oct 2026, 12:00 pm". A fixed time zone keeps server and browser
 * output identical (no hydration mismatch).
 */
export const formatTimestamp = (utc: string | null | undefined): string =>
  utc ? IST_DATE_TIME.format(new Date(`${utc.replace(" ", "T")}Z`)) : "";

export const SITE_STATUS_LABELS = {
  active: "Active",
  completed: "Completed",
  on_hold: "On hold",
} as const;
