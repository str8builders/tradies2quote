/**
 * EAN-13 barcodes for the marketing screens, drawn bar for bar so a phone
 * camera could read them. The demo uses a 200–299 code: GS1 keeps that range
 * for in-store use, so it can never be a real product's barcode.
 */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** Which left-hand digits use the G set, by the first digit. */
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** The check digit for the first 12 digits (weights 1, 3, 1, 3 …). */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error("EAN-13 needs 12 digits before the check digit");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** The full 13-digit code. */
export function ean13(first12: string): string {
  return first12 + ean13CheckDigit(first12);
}

/** The 95 modules (1 = bar) of a 13-digit code: guard, 6 left digits, centre guard, 6 right digits, guard. */
export function ean13Modules(code: string): string {
  if (!/^\d{13}$/.test(code) || ean13CheckDigit(code.slice(0, 12)) !== Number(code[12])) {
    throw new Error(`not a valid EAN-13: ${code}`);
  }
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let out = "101";
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "L" ? L : G)[d[i]];
  out += "01010";
  for (let i = 7; i <= 12; i++) out += R[d[i]];
  return out + "101";
}

/** The example product's code: 200 (in-store range) + 123456789 + check digit. */
export const DEMO_BARCODE = ean13("200123456789");
