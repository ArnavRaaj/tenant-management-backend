/** Escapes a string for safe literal use inside a RegExp. */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes user-controlled text before interpolating it into HTML (emails). */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);

/** Normalises an Indian mobile number to its last 10 digits. */
export const normalizePhone = (phone: string | null | undefined): string => {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

export const maskPhone = (phone: string): string =>
  phone.length >= 4 ? `XXXXXX${phone.slice(-4)}` : "XXXX";

export const maskAadhaar = (aadhaar: string): string =>
  `XXXX-XXXX-${aadhaar.replace(/\D/g, "").slice(-4)}`;

export const MASKED_AADHAAR_PATTERN = /^X{4}-X{4}-\d{4}$/;
