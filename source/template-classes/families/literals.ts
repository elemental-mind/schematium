import type { LiteralType } from "../../api/templating-contracts.ts";
import type { Validator } from "../../validation/validation.ts";
import type { InternalValueTemplate, ValueTemplateConstructor } from "../base.ts";
import type { PrimitiveTemplateFamily } from "./primitives.ts";

import { TypeMismatch } from "../../validation/validation.ts";

export type LiteralTemplateConstructor = new <T extends LiteralType>(value: T) => InternalValueTemplate<T>;

export interface LiteralTemplateDependencies extends PrimitiveTemplateFamily
{
    typeFromExample(exampleValue: LiteralType): InternalValueTemplate<any>;
}

export function createLiteralTemplate(ValueTemplate: ValueTemplateConstructor, dependencies: LiteralTemplateDependencies): LiteralTemplateConstructor
{
    class LiteralTemplate<T extends LiteralType> extends ValueTemplate<T>
    {
        permittedValue: T;
        permittedValueTemplate: InternalValueTemplate<T>;

        constructor(permittedValue: T)
        {
            super();
            this.permittedValue = permittedValue;
            this.permittedValueTemplate = dependencies.typeFromExample(permittedValue);

            const isPrimitiveTemplate = [
                dependencies.NumberTemplate,
                dependencies.StringTemplate,
                dependencies.BooleanTemplate,
            ].some(PrimitiveTemplate => this.permittedValueTemplate instanceof PrimitiveTemplate);

            if (!isPrimitiveTemplate)
                throw new Error("Only numbers, booleans or strings permitted as literal types");
        }

        parseIntoRawType(value: string, validator: Validator): T | undefined
        {
            return this.permittedValueTemplate.parseIntoRawType(value, validator);
        }

        validateType(value: unknown, validator: Validator): Validator
        {
            return value === this.permittedValue
                ? validator
                : validator.rejectWith(TypeMismatch, `Literal "${this.permittedValue}" expected`);
        }

        identifiesBaseType(value: unknown): boolean
        {
            return this.permittedValueTemplate.identifiesBaseType(value);
        }
    }

    return LiteralTemplate;
}
