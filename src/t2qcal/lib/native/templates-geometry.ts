import { floorInt, ulp } from "./format";

/**
 * Geometry the native printable-template tools call, ported line for line from
 * ios/T2QCAL/T2QCAL/Models/RadialTemplateGeometry.swift. Both structs are
 * failable initialisers in Swift, so the factories here return `null` on the
 * same guards and the compute closures print the native fallback row.
 */

export type TemplatePoint = { x: number; y: number };

export class RadialTemplateGeometry {
  private constructor(
    readonly diameter: number,
    readonly divisions: number,
    readonly holeDiameter: number,
  ) {}

  get radius(): number {
    return this.diameter / 2;
  }

  get angle(): number {
    return (2 * Math.PI) / this.divisions;
  }

  get chord(): number {
    return this.diameter * Math.sin(this.angle / 2);
  }

  get edgeClearance(): number {
    return Math.max(0, this.chord - this.holeDiameter);
  }

  get centres(): TemplatePoint[] {
    const { radius, angle } = this;
    return Array.from({ length: this.divisions }, (_, i) => {
      const a = Math.PI / 2 - i * angle;
      return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
    });
  }

  static make(diameter: number, divisions: number, holeDiameter = 0): RadialTemplateGeometry | null {
    if (!Number.isFinite(diameter) || !(diameter > 0)) return null;
    if (!Number.isInteger(divisions) || divisions < 3 || divisions > 360) return null;
    if (!Number.isFinite(holeDiameter) || holeDiameter < 0) return null;
    const chord = diameter * Math.sin(Math.PI / divisions);
    if (!(holeDiameter <= chord + 16 * ulp(chord))) return null;
    return new RadialTemplateGeometry(diameter, divisions, holeDiameter);
  }

  /** Includes both ends of a half-circle, even when its last step is shorter. */
  static degreeMarks(increment: number): number[] {
    if (!Number.isInteger(increment) || increment < 1 || increment > 180) return [];
    const marks: number[] = [];
    for (let value = 0; value <= 180; value += increment) marks.push(value);
    if (marks[marks.length - 1] !== 180) marks.push(180);
    return marks;
  }
}

export class DiameterTapeGeometry {
  private constructor(
    readonly diameter: number,
    readonly increment: number,
    readonly overlap: number,
    readonly labels: number[],
  ) {}

  get circumference(): number {
    return Math.PI * this.diameter;
  }

  get length(): number {
    return this.circumference + this.overlap;
  }

  get positions(): number[] {
    return this.labels.map((label) => Math.PI * label);
  }

  static make(diameter: number, increment: number, overlap: number): DiameterTapeGeometry | null {
    if (![diameter, increment, overlap].every((value) => Number.isFinite(value))) return null;
    if (!(diameter > 0) || !(increment > 0) || !(overlap >= 0)) return null;
    const ratio = diameter / increment;
    if (!Number.isFinite(ratio) || !(ratio <= 9999 + 16 * ulp(ratio))) return null;
    const count = floorInt(ratio, 0, 9999);
    const marks = Array.from({ length: count + 1 }, (_, i) => i * increment);
    if (Math.abs((marks[marks.length - 1] ?? 0) - diameter) <= 16 * ulp(diameter)) {
      marks[marks.length - 1] = diameter;
    } else {
      marks.push(diameter);
    }
    if (marks.length > 10000) return null;
    return new DiameterTapeGeometry(diameter, increment, overlap, marks);
  }
}
