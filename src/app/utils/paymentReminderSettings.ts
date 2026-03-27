export const PAYMENT_REMINDER_DAYS_KEY = "settings:payment-reminder-days";
export const PAYMENT_REMINDER_DAYS_CHANGED_EVENT = "settings:payment-reminder-days:changed";
export const DEFAULT_PAYMENT_REMINDER_DAYS = 7;
export const LOW_STOCK_THRESHOLD_KEY = "settings:low-stock-threshold";
export const LOW_STOCK_THRESHOLD_CHANGED_EVENT = "settings:low-stock-threshold:changed";
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

const MIN_REMINDER_DAYS = 1;
const MAX_REMINDER_DAYS = 365;
const MIN_LOW_STOCK_THRESHOLD = 1;
const MAX_LOW_STOCK_THRESHOLD = 999;

const clampReminderDays = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_PAYMENT_REMINDER_DAYS;
  return Math.min(MAX_REMINDER_DAYS, Math.max(MIN_REMINDER_DAYS, Math.round(value)));
};

const clampLowStockThreshold = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_LOW_STOCK_THRESHOLD;
  return Math.min(MAX_LOW_STOCK_THRESHOLD, Math.max(MIN_LOW_STOCK_THRESHOLD, Math.round(value)));
};

export const loadPaymentReminderDays = () => {
  try {
    const raw = localStorage.getItem(PAYMENT_REMINDER_DAYS_KEY);
    if (!raw) return DEFAULT_PAYMENT_REMINDER_DAYS;
    return clampReminderDays(Number(raw));
  } catch {
    return DEFAULT_PAYMENT_REMINDER_DAYS;
  }
};

const applyReminderDaysLocal = (days: number) => {
  const normalized = clampReminderDays(days);
  localStorage.setItem(PAYMENT_REMINDER_DAYS_KEY, String(normalized));
  window.dispatchEvent(
    new CustomEvent(PAYMENT_REMINDER_DAYS_CHANGED_EVENT, {
      detail: { days: normalized },
    })
  );
  return normalized;
};

export const savePaymentReminderDays = (days: number) => {
  return applyReminderDaysLocal(days);
};

export const loadLowStockThreshold = () => {
  try {
    const raw = localStorage.getItem(LOW_STOCK_THRESHOLD_KEY);
    if (!raw) return DEFAULT_LOW_STOCK_THRESHOLD;
    return clampLowStockThreshold(Number(raw));
  } catch {
    return DEFAULT_LOW_STOCK_THRESHOLD;
  }
};

const applyLowStockThresholdLocal = (threshold: number) => {
  const normalized = clampLowStockThreshold(threshold);
  localStorage.setItem(LOW_STOCK_THRESHOLD_KEY, String(normalized));
  window.dispatchEvent(
    new CustomEvent(LOW_STOCK_THRESHOLD_CHANGED_EVENT, {
      detail: { threshold: normalized },
    })
  );
  return normalized;
};

export const fetchGlobalLowStockThreshold = async () => {
  try {
    const response = await fetch("/api/auth/settings/low-stock-threshold");
    if (!response.ok) {
      throw new Error("No se pudo cargar la configuracion global de bajo stock");
    }

    const payload = await response.json().catch(() => ({}));
    const value = clampLowStockThreshold(Number(payload?.threshold));
    return applyLowStockThresholdLocal(value);
  } catch {
    return loadLowStockThreshold();
  }
};

export const saveGlobalLowStockThreshold = async (
  threshold: number,
  requester?: { userId?: number | string; role?: string }
) => {
  const normalized = clampLowStockThreshold(threshold);

  const response = await fetch("/api/auth/settings/low-stock-threshold", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(requester?.userId || ""),
      "x-user-role": String(requester?.role || ""),
    },
    body: JSON.stringify({ threshold: normalized }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo guardar la configuracion global");
  }

  return applyLowStockThresholdLocal(clampLowStockThreshold(Number(payload?.threshold || normalized)));
};

export const fetchGlobalPaymentReminderDays = async () => {
  try {
    const response = await fetch("/api/auth/settings/payment-reminder-days");
    if (!response.ok) {
      throw new Error("No se pudo cargar la configuracion global de dias de cobro");
    }

    const payload = await response.json().catch(() => ({}));
    const value = clampReminderDays(Number(payload?.days));
    return applyReminderDaysLocal(value);
  } catch {
    return loadPaymentReminderDays();
  }
};

export const saveGlobalPaymentReminderDays = async (days: number, requester?: { userId?: number | string; role?: string }) => {
  const normalized = clampReminderDays(days);

  const response = await fetch("/api/auth/settings/payment-reminder-days", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(requester?.userId || ""),
      "x-user-role": String(requester?.role || ""),
    },
    body: JSON.stringify({ days: normalized }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo guardar la configuracion global");
  }

  return applyReminderDaysLocal(clampReminderDays(Number(payload?.days || normalized)));
};
