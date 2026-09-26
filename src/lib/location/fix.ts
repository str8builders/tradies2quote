/** A position fix: where, and how sure (metres). */
export interface Fix {
  lat: number;
  lng: number;
  acc?: number | null;
}
