/**
 * The pre-send checklist on /app/beta, shared by the old and the new look.
 *
 * NOTE: copy deliberately avoids the word "beta" anywhere user-visible —
 * Apple rejects apps that present as beta/trial builds (2.3.10 / 2.1).
 */
export const PRE_SEND_CHECKS = [
  "Materials & quantities are right — especially from a drawing or supplier scan.",
  "Every line has a price — nothing sitting at $0 by accident (the app will warn you).",
  "The total and GST look right for the job.",
  "Supplier-quote imports: the lines match the supplier's quote (the app blocks if they don't).",
  "Drawings: you've confirmed the key dimensions when the app asks.",
] as const;
