import { ParseError, Validator } from "../../validation/validation.ts";
import type { InternalValueTemplate, ValueTemplateConstructor } from "../base.ts";

export type PrimitiveTemplateConstructor<T> = new () => InternalValueTemplate<T>;

export interface PrimitiveTemplateFamily
{
    StringTemplate: PrimitiveTemplateConstructor<string>;
    NumberTemplate: PrimitiveTemplateConstructor<number>;
    BooleanTemplate: PrimitiveTemplateConstructor<boolean>;
}

export function createPrimitiveTemplates(ValueTemplate: ValueTemplateConstructor): PrimitiveTemplateFamily
{
    class StringTemplate extends ValueTemplate<string>
    {
        readonly matchingPriority: number = 4;

        parseIntoRawType(value: string, validator: Validator): string | undefined
        {
            return value;
        }

        identifiesBaseType(value: unknown): boolean
        {
            return typeof value === "string";
        }
    }

    class NumberTemplate extends ValueTemplate<number>
    {
        readonly matchingPriority: number = 0;

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

    class BooleanTemplate extends ValueTemplate<boolean>
    {
        readonly matchingPriority: number = 1;

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

    return { StringTemplate, NumberTemplate, BooleanTemplate };
}