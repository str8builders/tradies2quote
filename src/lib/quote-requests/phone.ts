/**
 * Phone numbers arrive however the client typed them: "021 555 1234",
 * "+64 21 555 1234", "(021) 5551234". Matching an existing client on the raw
 * string missed most repeat requesters. Compare on the digits only, with the
 * NZ country code folded onto the local form so +64 21… equals 021….
 */
export function normalisePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0064")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("64") && digits.length >= 9) digits = `0${digits.slice(2)}`;
  return digits;
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalisePhone(a), y = normalisePhone(b);
  return x.length >= 6 && x === y;
}
