/**
 * Money is stored as integer paise to avoid floating-point drift
 * (0.1 + 0.2 !== 0.3). The API speaks rupees with up to 2 decimals.
 */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);

export const toRupees = (paise: number | null | undefined): number =>
  Math.round(paise ?? 0) / 100;

export const formatInr = (paise: number): string =>
  `₹${toRupees(paise).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
