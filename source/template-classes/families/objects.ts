import type { TemplateObject, TypeOption } from "../../api/definition-interface.ts";
import type { ExpectedType, MemberReflectionAPI } from "../../api/reflection-interface.ts";
import type { InternalValueTemplate } from "../../api/interal-interface.ts";

import { MissingMember, TypeMismatch, UnknownMember, Validator } from "../../validation/validation.ts";
import { ValueTemplate } from "../base.ts";

export interface InternalObjectTemplate<T = any> extends InternalValueTemplate<T>
{
    strict: boolean;
    entries: Readonly<Record<string, InternalValueTemplate<any>>>;
    keys: Set<string>;
    hasNonCloneDefaultMembers: boolean;
}

export class ObjectTemplate<T> extends ValueTemplate<T> implements MemberReflectionAPI
{
    public strict: boolean = true;
    public readonly entries: Readonly<Record<string, InternalValueTemplate<any>>>;
    public keys: Set<string> = new Set();
    public hasNonCloneDefaultMembers: boolean = false;
    private membersWithDefaultValues: Map<string, InternalValueTemplate<any>> = new Map();
    protected readonly objectTemplate = true;

    get type(): ExpectedType { return this.registry.object; }

    get memberType(): ExpectedType | readonly ExpectedType[]
    {
        const types = this.getUniqueTypes(Object.values(this.entries));
        return types.length === 1 ? types[0] : types;
    }

    constructor(templateObject: TemplateObject)
    {
        super();
        this.registry.cacheObjectTemplate(templateObject, this);
        this.isOptional = true;
        const entries: Array<[string, InternalValueTemplate<any>]> = [];

        for (const [key, value] of Object.entries(templateObject))
        {
            const subTemplate = this.registry.convertTypeInputToTemplate(value as TypeOption);

            this.keys.add(key);
            entries.push([key, subTemplate]);

            if (subTemplate.hasDefaultValue)
                this.membersWithDefaultValues.set(key, subTemplate);

            this.isOptional &&= subTemplate.isOptional;
        }

        this.entries = Object.freeze(Object.fromEntries(entries));
    }

    get hasDefaultValue()
    {
        return super.hasDefaultValue || this.membersWithDefaultValues.size !== 0;
    }

    expects(type: ExpectedType): boolean
    {
        return type === this.registry.object;
    }

    expectsMember(type: ExpectedType): boolean
    {
        return Object.values(this.entries).some(template => template.expects(type));
    }

    expectsMemberExclusively(type: ExpectedType): boolean
    {
        const members = Object.values(this.entries);
        return members.length !== 0 && members.every(template => template.expectsExclusively(type));
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
        for (const [key, template] of Object.entries(this.entries))
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

        for (const [key, template] of Object.entries(this.entries))
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
