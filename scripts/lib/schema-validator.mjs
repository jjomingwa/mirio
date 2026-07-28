import { URL } from "node:url";

const DIALECT = "https://json-schema.org/draft/2020-12/schema";

const KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "title",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "format",
  "allOf",
  "if",
  "then",
]);

const TYPES = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string",
]);
const FORMATS = new Set(["date-time", "uri"]);

function pointerToken(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPath(parent, token) {
  return `${parent}/${pointerToken(token)}`;
}

function issue(document, instancePath, schemaPath, keyword, message) {
  return { document, instancePath, schemaPath, keyword, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function structuralEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => structuralEqual(entry, right[index]))
    );
  }
  if (!isObject(left) || !isObject(right)) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) && structuralEqual(left[key], right[key]),
    )
  );
}

function keywordValueError(schema, schemaPath) {
  if ("$schema" in schema && schema.$schema !== DIALECT) {
    return [
      "$schema",
      childPath(schemaPath, "$schema"),
      `must equal ${DIALECT}`,
    ];
  }
  if ("$id" in schema && typeof schema.$id !== "string") {
    return ["$id", childPath(schemaPath, "$id"), "must be a string"];
  }
  if ("title" in schema && typeof schema.title !== "string") {
    return ["title", childPath(schemaPath, "title"), "must be a string"];
  }
  if (
    "type" in schema &&
    !(
      (typeof schema.type === "string" && TYPES.has(schema.type)) ||
      (Array.isArray(schema.type) &&
        schema.type.length > 0 &&
        new Set(schema.type).size === schema.type.length &&
        schema.type.every((entry) => TYPES.has(entry)))
    )
  ) {
    return [
      "type",
      childPath(schemaPath, "type"),
      "must be a supported type or a non-empty unique array of supported types",
    ];
  }
  if (
    "enum" in schema &&
    (!Array.isArray(schema.enum) || schema.enum.length === 0)
  ) {
    return ["enum", childPath(schemaPath, "enum"), "must be a non-empty array"];
  }
  if (
    "required" in schema &&
    (!Array.isArray(schema.required) ||
      new Set(schema.required).size !== schema.required.length ||
      !schema.required.every((entry) => typeof entry === "string"))
  ) {
    return [
      "required",
      childPath(schemaPath, "required"),
      "must be a unique array of strings",
    ];
  }
  if ("properties" in schema && !isObject(schema.properties)) {
    return [
      "properties",
      childPath(schemaPath, "properties"),
      "must be an object",
    ];
  }
  if ("$defs" in schema && !isObject(schema.$defs)) {
    return ["$defs", childPath(schemaPath, "$defs"), "must be an object"];
  }
  if (
    "additionalProperties" in schema &&
    typeof schema.additionalProperties !== "boolean"
  ) {
    return [
      "additionalProperties",
      childPath(schemaPath, "additionalProperties"),
      "must be a boolean in the audited subset",
    ];
  }
  if ("minItems" in schema && !isNonNegativeInteger(schema.minItems)) {
    return [
      "minItems",
      childPath(schemaPath, "minItems"),
      "must be a non-negative integer",
    ];
  }
  if ("maxItems" in schema && !isNonNegativeInteger(schema.maxItems)) {
    return [
      "maxItems",
      childPath(schemaPath, "maxItems"),
      "must be a non-negative integer",
    ];
  }
  if ("uniqueItems" in schema && typeof schema.uniqueItems !== "boolean") {
    return [
      "uniqueItems",
      childPath(schemaPath, "uniqueItems"),
      "must be a boolean",
    ];
  }
  if ("minLength" in schema && !isNonNegativeInteger(schema.minLength)) {
    return [
      "minLength",
      childPath(schemaPath, "minLength"),
      "must be a non-negative integer",
    ];
  }
  if ("pattern" in schema && typeof schema.pattern !== "string") {
    return ["pattern", childPath(schemaPath, "pattern"), "must be a string"];
  }
  if ("pattern" in schema) {
    try {
      new RegExp(schema.pattern, "u");
    } catch {
      return [
        "pattern",
        childPath(schemaPath, "pattern"),
        "must be a valid Unicode regular expression",
      ];
    }
  }
  for (const keyword of ["minimum", "maximum", "exclusiveMinimum"]) {
    if (
      keyword in schema &&
      (typeof schema[keyword] !== "number" || !Number.isFinite(schema[keyword]))
    ) {
      return [
        keyword,
        childPath(schemaPath, keyword),
        "must be a finite number",
      ];
    }
  }
  if ("format" in schema && !FORMATS.has(schema.format)) {
    return [
      "format",
      childPath(schemaPath, "format"),
      "must be one of: date-time, uri",
    ];
  }
  if (
    "allOf" in schema &&
    (!Array.isArray(schema.allOf) || schema.allOf.length === 0)
  ) {
    return [
      "allOf",
      childPath(schemaPath, "allOf"),
      "must be a non-empty array",
    ];
  }
  if ("$ref" in schema) {
    if (typeof schema.$ref !== "string") {
      return ["$ref", childPath(schemaPath, "$ref"), "must be a string"];
    }
    if (schema.$ref !== "#" && !schema.$ref.startsWith("#/")) {
      return [
        "$ref",
        childPath(schemaPath, "$ref"),
        "remote and non-pointer references are unsupported",
      ];
    }
  }
  return null;
}

function nestedSchemas(schema, schemaPath) {
  const children = [];
  for (const containerKeyword of ["$defs", "properties"]) {
    if (!isObject(schema[containerKeyword])) continue;
    for (const [name, child] of Object.entries(schema[containerKeyword])) {
      children.push([
        child,
        childPath(childPath(schemaPath, containerKeyword), name),
      ]);
    }
  }
  if ("items" in schema)
    children.push([schema.items, childPath(schemaPath, "items")]);
  for (const keyword of ["if", "then"]) {
    if (keyword in schema)
      children.push([schema[keyword], childPath(schemaPath, keyword)]);
  }
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((child, index) =>
      children.push([child, childPath(childPath(schemaPath, "allOf"), index)]),
    );
  }
  return children;
}

export function preflightSchema(schema, { document = "<schema>" } = {}) {
  const errors = [];

  function visit(current, schemaPath) {
    if (!isObject(current)) {
      errors.push(
        issue(
          document,
          "",
          schemaPath,
          "schema",
          "must be an object in the audited subset",
        ),
      );
      return;
    }

    for (const keyword of Object.keys(current)) {
      if (!KEYWORDS.has(keyword)) {
        errors.push(
          issue(
            document,
            "",
            childPath(schemaPath, keyword),
            keyword,
            "unsupported schema keyword",
          ),
        );
      }
    }

    const valueError = keywordValueError(current, schemaPath);
    if (valueError) {
      errors.push(
        issue(document, "", valueError[1], valueError[0], valueError[2]),
      );
    }

    for (const [child, childSchemaPath] of nestedSchemas(current, schemaPath)) {
      visit(child, childSchemaPath);
    }
  }

  visit(schema, "#");
  return errors;
}

function resolveLocalReference(rootSchema, reference) {
  if (reference === "#") return rootSchema;
  let fragment;
  try {
    fragment = decodeURIComponent(reference.slice(1));
  } catch {
    return undefined;
  }
  const tokens = fragment
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current = rootSchema;
  for (const token of tokens) {
    if (!isObject(current) || !Object.hasOwn(current, token)) return undefined;
    current = current[token];
  }
  return current;
}

function matchesType(value, type) {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        Number.isInteger(value)
      );
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return isObject(value);
    case "string":
      return typeof value === "string";
    default:
      return false;
  }
}

function isDateTime(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText ?? 0);
  const offsetMinute = Number(offsetMinuteText ?? 0);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function isUri(value) {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol) && !/\s/u.test(value);
  } catch {
    return false;
  }
}

export function validateSchemaDocument({
  schema,
  value,
  document = "<document>",
}) {
  const preflightErrors = preflightSchema(schema, { document });
  if (preflightErrors.length > 0) return preflightErrors;

  const errors = [];

  function add(instancePath, schemaPath, keyword, message) {
    errors.push(issue(document, instancePath, schemaPath, keyword, message));
  }

  function validate(currentSchema, currentValue, instancePath, schemaPath) {
    if ("$ref" in currentSchema) {
      const target = resolveLocalReference(schema, currentSchema.$ref);
      if (target === undefined) {
        add(
          instancePath,
          childPath(schemaPath, "$ref"),
          "$ref",
          `unresolved local reference: ${currentSchema.$ref}`,
        );
      } else {
        validate(target, currentValue, instancePath, currentSchema.$ref);
      }
    }

    if ("type" in currentSchema) {
      const allowed = Array.isArray(currentSchema.type)
        ? currentSchema.type
        : [currentSchema.type];
      if (!allowed.some((type) => matchesType(currentValue, type))) {
        add(
          instancePath,
          childPath(schemaPath, "type"),
          "type",
          `must be ${allowed.join(" or ")}`,
        );
        return;
      }
    }

    if (
      "const" in currentSchema &&
      !structuralEqual(currentValue, currentSchema.const)
    ) {
      add(
        instancePath,
        childPath(schemaPath, "const"),
        "const",
        "must equal the constant value",
      );
    }
    if (
      "enum" in currentSchema &&
      !currentSchema.enum.some((entry) => structuralEqual(currentValue, entry))
    ) {
      add(
        instancePath,
        childPath(schemaPath, "enum"),
        "enum",
        "must equal one of the allowed values",
      );
    }

    if (isObject(currentValue)) {
      for (const required of currentSchema.required ?? []) {
        if (!Object.hasOwn(currentValue, required)) {
          add(
            instancePath,
            childPath(schemaPath, "required"),
            "required",
            `must have required property ${required}`,
          );
        }
      }
      for (const [name, propertySchema] of Object.entries(
        currentSchema.properties ?? {},
      )) {
        if (Object.hasOwn(currentValue, name)) {
          validate(
            propertySchema,
            currentValue[name],
            childPath(instancePath, name),
            childPath(childPath(schemaPath, "properties"), name),
          );
        }
      }
      if (currentSchema.additionalProperties === false) {
        const allowed = new Set(Object.keys(currentSchema.properties ?? {}));
        for (const name of Object.keys(currentValue)) {
          if (!allowed.has(name)) {
            add(
              childPath(instancePath, name),
              childPath(schemaPath, "additionalProperties"),
              "additionalProperties",
              `property ${name} is not allowed`,
            );
          }
        }
      }
    }

    if (Array.isArray(currentValue)) {
      if (
        "minItems" in currentSchema &&
        currentValue.length < currentSchema.minItems
      ) {
        add(
          instancePath,
          childPath(schemaPath, "minItems"),
          "minItems",
          `must contain at least ${currentSchema.minItems} items`,
        );
      }
      if (
        "maxItems" in currentSchema &&
        currentValue.length > currentSchema.maxItems
      ) {
        add(
          instancePath,
          childPath(schemaPath, "maxItems"),
          "maxItems",
          `must contain at most ${currentSchema.maxItems} items`,
        );
      }
      if (
        currentSchema.uniqueItems &&
        currentValue.some((entry, index) =>
          currentValue
            .slice(0, index)
            .some((earlier) => structuralEqual(entry, earlier)),
        )
      ) {
        add(
          instancePath,
          childPath(schemaPath, "uniqueItems"),
          "uniqueItems",
          "must contain structurally unique items",
        );
      }
      if ("items" in currentSchema) {
        currentValue.forEach((entry, index) =>
          validate(
            currentSchema.items,
            entry,
            childPath(instancePath, index),
            childPath(schemaPath, "items"),
          ),
        );
      }
    }

    if (typeof currentValue === "string") {
      if (
        "minLength" in currentSchema &&
        [...currentValue].length < currentSchema.minLength
      ) {
        add(
          instancePath,
          childPath(schemaPath, "minLength"),
          "minLength",
          `must contain at least ${currentSchema.minLength} Unicode code points`,
        );
      }
      if (
        "pattern" in currentSchema &&
        !new RegExp(currentSchema.pattern, "u").test(currentValue)
      ) {
        add(
          instancePath,
          childPath(schemaPath, "pattern"),
          "pattern",
          `must match pattern ${currentSchema.pattern}`,
        );
      }
      if (currentSchema.format === "date-time" && !isDateTime(currentValue)) {
        add(
          instancePath,
          childPath(schemaPath, "format"),
          "format",
          "must be a valid RFC 3339 date-time",
        );
      }
      if (currentSchema.format === "uri" && !isUri(currentValue)) {
        add(
          instancePath,
          childPath(schemaPath, "format"),
          "format",
          "must be an absolute URI",
        );
      }
    }

    if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
      if ("minimum" in currentSchema && currentValue < currentSchema.minimum) {
        add(
          instancePath,
          childPath(schemaPath, "minimum"),
          "minimum",
          `must be at least ${currentSchema.minimum}`,
        );
      }
      if ("maximum" in currentSchema && currentValue > currentSchema.maximum) {
        add(
          instancePath,
          childPath(schemaPath, "maximum"),
          "maximum",
          `must be at most ${currentSchema.maximum}`,
        );
      }
      if (
        "exclusiveMinimum" in currentSchema &&
        currentValue <= currentSchema.exclusiveMinimum
      ) {
        add(
          instancePath,
          childPath(schemaPath, "exclusiveMinimum"),
          "exclusiveMinimum",
          `must be greater than ${currentSchema.exclusiveMinimum}`,
        );
      }
    }

    for (const [index, child] of (currentSchema.allOf ?? []).entries()) {
      validate(
        child,
        currentValue,
        instancePath,
        childPath(childPath(schemaPath, "allOf"), index),
      );
    }

    if ("if" in currentSchema) {
      const before = errors.length;
      validate(
        currentSchema.if,
        currentValue,
        instancePath,
        childPath(schemaPath, "if"),
      );
      const conditionMatches = errors.length === before;
      errors.length = before;
      if (conditionMatches && "then" in currentSchema) {
        validate(
          currentSchema.then,
          currentValue,
          instancePath,
          childPath(schemaPath, "then"),
        );
      }
    }
  }

  validate(schema, value, "", "#");
  return errors;
}

export { DIALECT };
