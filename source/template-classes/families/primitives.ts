import type { ExpectedType } from "../../api/reflection-interface.ts";
import type { JSONSchema, JSONSchemaContext } from "../../json-schema/json-schema.ts";

import { ParseError, Validator } from "../../validation/validation.ts";
import { ValueTemplate } from "../base.ts";

export class StringTemplate extends ValueTemplate<string>
{
    readonly matchingPriority: number = 4;
    protected readonly typeLabel = "string";

    get type(): ExpectedType { return this.registry.string; }

    expects(type: ExpectedType): boolean
    {
        return type === this.registry.string;
    }

    parseIntoRawType(value: string, validator: Validator): string | undefined
    {
        return value;
    }

    identifiesBaseType(value: unknown): boolean
    {
        return typeof value === "string";
    }

    buildJSONSchema(context: JSONSchemaContext): JSONSchema
    {
        return { type: "string", ...super.buildJSONSchema(context) };
    }
}

export class NumberTemplate extends ValueTemplate<number>
{
    readonly matchingPriority: number = 0;
    protected readonly typeLabel = "number";

    get type(): ExpectedType { return this.registry.number; }

    expects(type: ExpectedType): boolean
    {
        return type === this.registry.number;
    }

    parseIntoRawType(value: string, validator: Validator): number | undefined
    {
        if (value.trim() !== "")
            return Number(value);

        validator.rejectWith(ParseError, "'" + value + "' can not be parsed as number");
    }

    identifiesBaseType(value: unknown): boolean
    {
        return typeof value === "number" && Number.isFinite(value);
    }

    buildJSONSchema(context: JSONSchemaContext): JSONSchema
    {
        return { type: "number", ...super.buildJSONSchema(context) };
    }
}

export class BooleanTemplate extends ValueTemplate<boolean>
{
    readonly matchingPriority: number = 1;
    protected readonly typeLabel = "boolean";

    get type(): ExpectedType { return this.registry.boolean; }

    expects(type: ExpectedType): boolean
    {
        return type === this.registry.boolean;
    }

    parseIntoRawType(value: string, validator: Validator): boolean | undefined
    {
        const lowered = value.trim().toLowerCase();
        if (lowered === "true" || lowered === "1") return true;
        if (lowered === "false" || lowered === "0") return false;

        validator.rejectWith(ParseError, "'" + value + "' can not be parsed as boolean");
    }

    identifiesBaseType(value: unknown): boolean
    {
        return typeof value === "boolean";
    }

    buildJSONSchema(context: JSONSchemaContext): JSONSchema
    {
        return { type: "boolean", ...super.buildJSONSchema(context) };
    }
}
