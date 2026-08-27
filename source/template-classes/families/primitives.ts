import { ParseError, Validator } from "../../validation/validation.ts";
import { ValueTemplate } from "../base.ts";

export class StringTemplate extends ValueTemplate<string>
{
    readonly matchingPriority: number = 4;
    protected readonly typeLabel = "string";

    parseIntoRawType(value: string, validator: Validator): string | undefined
    {
        return value;
    }

    identifiesBaseType(value: unknown): boolean
    {
        return typeof value === "string";
    }
}

export class NumberTemplate extends ValueTemplate<number>
{
    readonly matchingPriority: number = 0;
    protected readonly typeLabel = "number";

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
}

export class BooleanTemplate extends ValueTemplate<boolean>
{
    readonly matchingPriority: number = 1;
    protected readonly typeLabel = "boolean";

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
}
