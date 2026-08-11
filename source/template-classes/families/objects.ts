import type { TemplateObject, TypeOption } from "../../api/templating-contracts.ts";
import { MissingMember, TypeMismatch, UnknownMember, Validator } from "../../validation/validation.ts";
import type { InternalValueTemplate, ValueTemplateConstructor } from "../base.ts";

export interface InternalObjectTemplate<T = any> extends InternalValueTemplate<T>
{
    strict: boolean;
    entries: Array<[string, InternalValueTemplate<any>]>;
    keys: Set<string>;
    hasNonCloneDefaultMembers: boolean;
}

export interface ObjectTemplateConstructor
{
    fromTemplateObject(templateObject: TemplateObject): InternalObjectTemplate<any>;
}

export interface TypeInputResolver
{
    typeFromInput(typeOption: TypeOption): InternalValueTemplate<any>;
}

export function createObjectTemplate(
    ValueTemplate: ValueTemplateConstructor,
    typeInputResolver: TypeInputResolver,
): ObjectTemplateConstructor
{
    class ObjectTemplate<T> extends ValueTemplate<T>
    {
        static readonly TemplateCache = new WeakMap<TemplateObject, ObjectTemplate<any>>();

        static fromTemplateObject(templateObject: TemplateObject)
        {
            if (typeof templateObject !== "object")
                throw new Error("Expected template object, but got raw value instead");

            return ObjectTemplate.TemplateCache.get(templateObject) ?? new ObjectTemplate(templateObject);
        }

        public strict: boolean = true;
        public entries: Array<[string, InternalValueTemplate<any>]> = [];
        public keys: Set<string> = new Set();
        public hasNonCloneDefaultMembers: boolean = false;
        private membersWithDefaultValues: Map<string, InternalValueTemplate<any>> = new Map();

        private constructor(templateObject: TemplateObject)
        {
            super();
            ObjectTemplate.TemplateCache.set(templateObject, this);
            this.isOptional = true;

            for (const [key, value] of Object.entries(templateObject))
            {
                const subTemplate = value instanceof ValueTemplate
                    ? value
                    : typeInputResolver.typeFromInput(value as TypeOption);

                this.keys.add(key);
                this.entries.push([key, subTemplate]);

                if (subTemplate.hasDefaultValue)
                    this.membersWithDefaultValues.set(key, subTemplate);

                this.isOptional &&= subTemplate.isOptional;
            }
        }

        get hasDefaultValue()
        {
            return super.hasDefaultValue || this.membersWithDefaultValues.size !== 0;
        }

        parseIntoRawType = this.parseObject;

        identifiesBaseType(value: unknown): boolean
        {
            return value !== null && typeof value === "object" && !Array.isArray(value);
        }

        validateType(value: unknown, validator: Validator)
        {
            if (typeof value !== "object" || value === null)
                return validator.rejectWith(TypeMismatch, "Expected object");

            const input = value as Record<string, unknown>;
            for (const [key, template] of this.entries)
            {
                validator.pathTrace.push(key);

                if (Object.hasOwn(input, key))
                    template.validateWithValidator(input[key], validator);
                else if (!(template.isOptional || validator.allowPartial))
                    validator.rejectWith(MissingMember, "Expected property '" + key + "' in object");

                validator.pathTrace.pop();
                if (!validator.continueValidating) break;
            }

            if (validator.continueValidating && !validator.allowUnknowns && this.strict)
                for (const key of Object.keys(input))
                    if (!this.keys.has(key) &&
                        !validator.rejectWith(UnknownMember, "Member '" + key + "' not allowed").continueValidating)
                        break;

            return validator;
        }

        merge(base: any, override: any): any
        {
            const baseObject = this.identifiesBaseType(base) ? base as Record<string, unknown> : {};
            const overrideObject = override as Record<string, unknown>;
            const result: Record<string, unknown> = {};

            for (const [key, template] of this.entries)
            {
                if (Object.hasOwn(overrideObject, key))
                    result[key] = template.merge(baseObject[key], overrideObject[key]);
                else if (Object.hasOwn(baseObject, key))
                    result[key] = baseObject[key];
                else if (template.hasDefaultValue)
                    result[key] = template.getDefault();
            }

            return result as Partial<T>;
        }

        getDefault(): T | undefined
        {
            if (!this.hasDefaultValue)
                return undefined;

            if (super.hasDefaultValue)
                return super.getDefault();

            const clone: Record<string, unknown> = {};
            for (const [key, template] of this.membersWithDefaultValues)
                clone[key] = template.getDefault();

            return clone as T;
        }
    }

    return ObjectTemplate;
}
