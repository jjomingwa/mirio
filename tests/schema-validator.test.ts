import { describe, expect, it } from "vitest";

const schemaValidatorModulePath = "../scripts/lib/schema-validator.mjs";
const { DIALECT, preflightSchema, validateSchemaDocument } = await import(
  schemaValidatorModulePath
);

const schema = (properties: Record<string, unknown>) => ({
  $schema: DIALECT,
  ...properties,
});

const validate = (testSchema: Record<string, unknown>, value: unknown) =>
  validateSchemaDocument({
    schema: testSchema,
    value,
    document: "fixture.json",
  });

describe("schema preflight", () => {
  it("allows the audited metadata and rejects unknown dialects and keywords", () => {
    expect(
      preflightSchema(
        schema({
          $id: "fixture.schema.json",
          title: "Fixture",
          type: "string",
        }),
      ),
    ).toEqual([]);

    expect(
      preflightSchema({ $schema: "http://json-schema.org/draft-07/schema#" }),
    ).toMatchObject([{ keyword: "$schema", schemaPath: "#/$schema" }]);
    expect(preflightSchema(schema({ oneOf: [] }))).toMatchObject([
      { keyword: "oneOf", schemaPath: "#/oneOf" },
    ]);
  });

  it("rejects unsupported formats and remote references", () => {
    expect(preflightSchema(schema({ format: "email" }))).toMatchObject([
      { keyword: "format", schemaPath: "#/format" },
    ]);
    expect(
      preflightSchema(
        schema({ $ref: "https://example.test/remote.schema.json" }),
      ),
    ).toMatchObject([{ keyword: "$ref", schemaPath: "#/$ref" }]);
  });
});

describe("audited JSON Schema validation", () => {
  it("reports exact issue fields for object shape and type failures", () => {
    const errors = validate(
      schema({
        type: "object",
        required: ["name"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          optional: { type: ["string", "null"] },
        },
      }),
      { extra: true },
    );

    expect(errors).toEqual([
      {
        document: "fixture.json",
        instancePath: "",
        schemaPath: "#/required",
        keyword: "required",
        message: "must have required property name",
      },
      {
        document: "fixture.json",
        instancePath: "/extra",
        schemaPath: "#/additionalProperties",
        keyword: "additionalProperties",
        message: "property extra is not allowed",
      },
    ]);
    expect(validate(schema({ type: "integer" }), 1.5)[0].keyword).toBe("type");
    expect(validate(schema({ type: "boolean" }), true)).toEqual([]);
  });

  it("supports structural const and enum equality", () => {
    expect(validate(schema({ const: { a: 1, b: 2 } }), { b: 2, a: 1 })).toEqual(
      [],
    );
    expect(validate(schema({ enum: [{ a: [1, 2] }] }), { a: [1, 2] })).toEqual(
      [],
    );
    expect(validate(schema({ enum: [1, 2] }), 3)[0].keyword).toBe("enum");
  });

  it("supports items, item bounds, and structural uniqueItems", () => {
    const testSchema = schema({
      type: "array",
      minItems: 2,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "object" },
    });

    expect(validate(testSchema, [{ a: 1 }, { a: 2 }])).toEqual([]);
    expect(validate(testSchema, [{ a: 1 }, { a: 1 }])).toMatchObject([
      { keyword: "uniqueItems", instancePath: "" },
    ]);
    expect(validate(testSchema, [1])).toMatchObject([
      { keyword: "minItems" },
      { keyword: "type", instancePath: "/0" },
    ]);
    expect(validate(testSchema, [{}, {}, {}, {}])[0].keyword).toBe("maxItems");
  });

  it("counts Unicode code points and applies patterns", () => {
    expect(validate(schema({ type: "string", minLength: 1 }), "😀")).toEqual(
      [],
    );
    expect(validate(schema({ minLength: 2 }), "😀")[0].keyword).toBe(
      "minLength",
    );
    expect(validate(schema({ pattern: "^[A-Z]+$" }), "abc")[0].keyword).toBe(
      "pattern",
    );
  });

  it("supports numeric limits", () => {
    const testSchema = schema({
      type: "number",
      minimum: 1,
      maximum: 3,
      exclusiveMinimum: 1,
    });
    expect(validate(testSchema, 2)).toEqual([]);
    expect(
      validate(testSchema, 1).map(
        (error: { keyword: string }) => error.keyword,
      ),
    ).toEqual(["exclusiveMinimum"]);
    expect(validate(testSchema, 4)[0].keyword).toBe("maximum");
  });

  it("asserts RFC 3339 date-time and absolute URI formats", () => {
    expect(
      validate(
        schema({ type: "string", format: "date-time" }),
        "2024-02-29T23:59:59Z",
      ),
    ).toEqual([]);
    expect(
      validate(schema({ format: "date-time" }), "2023-02-29T00:00:00Z")[0]
        .keyword,
    ).toBe("format");
    expect(
      validate(
        schema({ type: "string", format: "uri" }),
        "https://example.test/a",
      ),
    ).toEqual([]);
    expect(validate(schema({ format: "uri" }), "/relative")[0].keyword).toBe(
      "format",
    );
  });

  it("applies allOf and if/then without leaking failed if diagnostics", () => {
    const testSchema = schema({
      type: "object",
      properties: {
        status: { enum: ["PASS", "FAIL"] },
        evidence: { type: "array" },
      },
      allOf: [{ required: ["status"] }],
      if: {
        properties: { status: { const: "PASS" } },
        required: ["status"],
      },
      then: {
        properties: { evidence: { minItems: 1 } },
        required: ["evidence"],
      },
    });

    expect(validate(testSchema, { status: "FAIL" })).toEqual([]);
    expect(
      validate(testSchema, { status: "PASS", evidence: [] }),
    ).toMatchObject([
      {
        keyword: "minItems",
        schemaPath: "#/then/properties/evidence/minItems",
      },
    ]);
  });

  it("resolves decoded local pointers and applies 2020-12 ref siblings", () => {
    const testSchema = schema({
      $defs: {
        "list/value~contract": {
          type: "array",
          items: { type: "string" },
        },
      },
      $ref: "#/$defs/list~1value~0contract",
      minItems: 2,
    });

    expect(validate(testSchema, ["a", "b"])).toEqual([]);
    expect(validate(testSchema, ["a"])).toMatchObject([
      { keyword: "minItems", schemaPath: "#/minItems" },
    ]);
    expect(validate(testSchema, [1])).toMatchObject([
      {
        keyword: "type",
        instancePath: "/0",
        schemaPath: "#/$defs/list~1value~0contract/items/type",
      },
      { keyword: "minItems", schemaPath: "#/minItems" },
    ]);
  });
});
