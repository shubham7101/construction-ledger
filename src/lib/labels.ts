export type PaymentModeValue = "cash" | "upi" | "bank_transfer" | "cheque";

const MODE_LABELS: Record<PaymentModeValue, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
};

/** "bank_transfer" → "Bank Transfer"; unknown values pass through. */
export const modeLabel = (mode: string): string =>
  MODE_LABELS[mode as PaymentModeValue] ?? mode;

/** "Bank Transfer" → "bank_transfer"; anything unknown falls back to UPI. */
export const modeValue = (label: string | undefined): PaymentModeValue =>
  (Object.keys(MODE_LABELS) as PaymentModeValue[]).find(
    (value) => MODE_LABELS[value] === label,
  ) ?? "upi";
