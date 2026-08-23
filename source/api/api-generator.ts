import type { CheckAPI, CollectionDefinitionAPI, DefinitionAPI, LiteralType, ObjectDefinitionAPI, PrimitiveType, TemplateObject, TypeOption } from "./definition-interface.ts";
import type { InferSchemaType, InferTypeDefinitionType } from "./utility-types/inference.ts";
import type { OptionalEntry, RequiredEntry } from "./utility-types/optionality.ts";
import type { ObjectValidatorAPI, ValidatorAPI } from "./validator-interface.ts";
import type { ValueAPI } from "../template-classes/base.ts";

import { TemplateRegistry } from "../template-classes/registry.ts";

export interface TemplateAPIExtensions
{
    definitionExtensions?: {
        general?: object;
        primitive?: object;
        object?: object;
        variadic?: object;
        collection?: object;
    };
    validationExtensions?: {
        general?: object;
        object?: object;
    };
}

type GetExtension<Extensions, Group extends PropertyKey, Kind extends PropertyKey> =
    Group extends keyof Extensions
    ? NonNullable<Extensions[Group]> extends infer ExtensionGroup
    ? Kind extends keyof ExtensionGroup ? NonNullable<ExtensionGroup[Kind]> : {}
    : {}
    : {};
type ValueValidator<Value, Extensions> = ValidatorAPI<Value, GetExtension<Extensions, "validationExtensions", "general">, GetExtension<Extensions, "validationExtensions", "object">> & GetExtension<Extensions, "validationExtensions", "general">;

export type ObjectValidatorFor<Template extends TemplateObject, Extensions extends TemplateAPIExtensions = {}> = ObjectValidatorAPI<InferSchemaType<Template>, ValidatorEntriesFor<Template, Extensions>, GetExtension<Extensions, "validationExtensions", "general">, GetExtension<Extensions, "validationExtensions", "object">> & GetExtension<Extensions, "validationExtensions", "general"> & GetExtension<Extensions, "validationExtensions", "object">;
export type ValidatorFor<Input, Extensions extends TemplateAPIExtensions = {}> =
    Input extends ObjectDefinitionAPI<infer Template> ? ObjectValidatorFor<Template, Extensions> :
    Input extends TemplateObject ? ObjectValidatorFor<Input, Extensions> :
    Input extends PrimitiveType ? ValueValidator<ReturnType<Input> extends ValueAPI<infer Value> ? Value : never, Extensions> :
    Input extends ValueAPI<infer Value> ? ValueValidator<Value, Extensions> :
    Input extends LiteralType ? ValueValidator<Input, Extensions> :
    never;
export type ValidatorEntriesFor<Template extends TemplateObject, Extensions extends TemplateAPIExtensions = {}> = { readonly [Key in keyof Template]: ValidatorFor<Template[Key], Extensions>; };

function generateDefinitionAPI<Extensions extends TemplateAPIExtensions>(registry: TemplateRegistry)
{
    const { StringTemplate, NumberTemplate, BooleanTemplate, VariadicTemplate, ObjectTemplate, RecordTemplate, ArrayTemplate, LiteralTemplate } = registry;

    function validatorFor<T extends TemplateObject>(template: T): ObjectValidatorFor<T, Extensions>;
    function validatorFor<T extends ValueAPI<any>>(template: T): ValidatorFor<T, Extensions>;
    function validatorFor(template: TemplateObject | ValueAPI<any>): any
    {
        return template instanceof registry.ValueTemplate ? template : ObjectTemplate.fromTemplateObject(template as TemplateObject);
    }

    function string(): DefinitionAPI<string> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    function string(defaultValue: string): CheckAPI<string> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    function string(defaultValue?: string)
    {
        return defaultValue !== undefined ? new StringTemplate().withDefault(defaultValue) : new StringTemplate();
    }

    function number(): DefinitionAPI<number> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    function number(defaultValue: number): CheckAPI<number> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    function number(defaultValue?: number)
    {
        return defaultValue !== undefined ? new NumberTemplate().withDefault(defaultValue) : new NumberTemplate();
    }

    function boolean(): DefinitionAPI<boolean> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    function boolean(defaultValue: boolean): CheckAPI<boolean> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "primitive">;
    function boolean(defaultValue?: boolean)
    {
        return defaultValue !== undefined ? new BooleanTemplate().withDefault(defaultValue) : new BooleanTemplate();
    }

    function valueOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): DefinitionAPI<InferTypeDefinitionType<T[number]>> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "variadic">;
    function valueOf(...types: any[])
    {
        return registry.convertTypeInputsToTemplate(...types) as any;
    }

    function oneOf<const T extends readonly [string | number, ...(string | number)[]]>(...possibleValues: T): DefinitionAPI<T[number]> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "variadic">;
    function oneOf(...possibleValues: any[])
    {
        return new VariadicTemplate(...possibleValues.map(value => new LiteralTemplate(value))) as any;
    }

    function object<T extends TemplateObject>(value: T): ObjectDefinitionAPI<T> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "object">;
    function object(value: any)
    {
        return ObjectTemplate.fromTemplateObject(value) as any;
    }

    function record<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<Record<string, T>> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "collection">;
    function record(defaultValue: Record<string, any>, cloneOnDefaultAssignment: boolean = true)
    {
        return new RecordTemplate(registry.inferTemplateFromValues(...Object.values(defaultValue))).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function recordOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionDefinitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "collection">;
    function recordOf(...types: any[])
    {
        return new RecordTemplate(registry.convertTypeInputsToTemplate(...types)) as any;
    }

    function array<T>(defaultValue: T[], cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<T[]> & OptionalEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "collection">;
    function array(defaultValue: any[], cloneOnDefaultAssignment = true)
    {
        return new ArrayTemplate(registry.inferTemplateFromValues(...Object.values(defaultValue))).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function arrayOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionDefinitionAPI<InferTypeDefinitionType<T[number]>[]> & RequiredEntry & GetExtension<Extensions, "definitionExtensions", "general"> & GetExtension<Extensions, "definitionExtensions", "collection">;
    function arrayOf(...types: any[])
    {
        return new ArrayTemplate(registry.convertTypeInputsToTemplate(...types)) as any;
    }

    return { validatorFor, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf };
}

export function generateTemplateAPI<Extensions extends TemplateAPIExtensions = {}>(BaseClass: new (...args: any[]) => any = Object)
{
    return generateDefinitionAPI<Extensions>(new TemplateRegistry(BaseClass));
}
