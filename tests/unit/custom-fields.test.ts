import { describe, expect, it } from "vitest";
import { validateFieldDefinition } from "../../src/lib/custom-fields";

describe("custom field definitions", () => {
  it("accepts every supported stable type", () => {
    for (const type of ["TEXT", "NUMBER", "DATE", "BOOLEAN", "USER", "URL"]) expect(validateFieldDefinition({ name: type, type })).toMatchObject({ type });
    expect(validateFieldDefinition({ name: "Stage", type: "SINGLE_SELECT", options: ["Alpha", "Beta"] }).options).toEqual(["Alpha", "Beta"]);
    expect(validateFieldDefinition({ name: "Regions", type: "MULTI_SELECT", options: ["EU", "APAC"] }).type).toBe("MULTI_SELECT");
  });
  it("rejects invalid names, types, and options", () => {
    expect(() => validateFieldDefinition({ name: "", type: "TEXT" })).toThrow(/name/i);
    expect(() => validateFieldDefinition({ name: "Bad", type: "MAGIC" })).toThrow(/type/i);
    expect(() => validateFieldDefinition({ name: "Bad", type: "TEXT", options: ["x"] })).toThrow(/select/i);
    expect(() => validateFieldDefinition({ name: "Bad", type: "SINGLE_SELECT", options: ["x", "x"] })).toThrow(/unique/i);
  });
});
