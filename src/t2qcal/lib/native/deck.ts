import type { VerifiedDefinition } from "../verified-calculators";

/**
 * Native-parity ports of ios/T2QCAL/T2QCAL/Models/ToolsDeck.swift.
 * Each entry is keyed by slug and must reproduce the native result rows,
 * marks, diagram values, handoffs and cuts recorded in
 * fixtures/native-reference.json (see native/parity.test.ts).
 */
export const definitions: Record<string, VerifiedDefinition> = {};
