import type { CheckAPI, CollectionDefinitionAPI, DefinitionAPI, TemplateObject, TypeOption } from "./definition-interface.ts";
import type { InferSchemaType, InferTypeDefinitionType } from "./utility-types/inference.ts";
import type { OptionalEntry, RequiredEntry } from "./utility-types/optionality.ts";
import type { SchemaAPI } from "./schema-interface.ts";

import { TemplateRegistry } from "../template-classes/registry.ts";

function generateDefinitionAPI<GeneralExt = {}, SchemaExt = {}, PrimitiveExt = {}, VariadicExt = {}, CollectionExt = {}>(registry: TemplateRegistry)
{
    const { StringTemplate, NumberTemplate, BooleanTemplate, VariadicTemplate, ObjectTemplate, RecordTemplate, ArrayTemplate, LiteralTemplate } = registry;

    function schema<T extends TemplateObject>(inputSchema: T): SchemaAPI<InferSchemaType<T>> & SchemaExt & GeneralExt;
    function schema(inputSchema: TemplateObject)
    {
        return ObjectTemplate.fromTemplateObject(inputSchema) as any;
    }

    function string(): DefinitionAPI<string> & RequiredEntry & PrimitiveExt & GeneralExt;
    function string(defaultValue: string): CheckAPI<string> & OptionalEntry & PrimitiveExt & GeneralExt;
    function string(defaultValue?: string)
    {
        return defaultValue !== undefined ? new StringTemplate().withDefault(defaultValue) : new StringTemplate();
    }

    function number(): DefinitionAPI<number> & RequiredEntry & PrimitiveExt & GeneralExt;
    function number(defaultValue: number): CheckAPI<number> & OptionalEntry & PrimitiveExt & GeneralExt;
    function number(defaultValue?: number)
    {
        return defaultValue !== undefined ? new NumberTemplate().withDefault(defaultValue) : new NumberTemplate();
    }

    function boolean(): DefinitionAPI<boolean> & RequiredEntry & PrimitiveExt & GeneralExt;
    function boolean(defaultValue: boolean): CheckAPI<boolean> & OptionalEntry & PrimitiveExt & GeneralExt;
    function boolean(defaultValue?: boolean)
    {
        return defaultValue !== undefined ? new BooleanTemplate().withDefault(defaultValue) : new BooleanTemplate();
    }

    function valueOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): DefinitionAPI<InferTypeDefinitionType<T[number]>> & RequiredEntry & VariadicExt & GeneralExt;
    function valueOf(...types: any[])
    {
        return registry.convertTypeInputsToTemplate(...types) as any;
    }

    function oneOf<const T extends readonly [string | number, ...(string | number)[]]>(...possibleValues: T): DefinitionAPI<T[number]> & RequiredEntry & VariadicExt & GeneralExt;
    function oneOf(...possibleValues: any[])
    {
        return new VariadicTemplate(...possibleValues.map(value => new LiteralTemplate(value))) as any;
    }

    function object<T extends TemplateObject>(value: T): DefinitionAPI<InferSchemaType<T>> & RequiredEntry & PrimitiveExt & GeneralExt;
    function object(value: any)
    {
        return ObjectTemplate.fromTemplateObject(value) as any;
    }

    function record<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<Record<string, T>> & OptionalEntry & CollectionExt & GeneralExt;
    function record(defaultValue: Record<string, any>, cloneOnDefaultAssignment: boolean = true)
    {
        return new RecordTemplate(registry.inferTemplateFromValues(...Object.values(defaultValue))).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function recordOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionDefinitionAPI<Record<string, InferTypeDefinitionType<T[number]>>> & RequiredEntry & CollectionExt & GeneralExt;
    function recordOf(...types: any[])
    {
        return new RecordTemplate(registry.convertTypeInputsToTemplate(...types)) as any;
    }

    function array<T>(defaultValue: T[], cloneOnDefaultAssignment?: boolean): CollectionDefinitionAPI<T[]> & OptionalEntry & CollectionExt & GeneralExt;
    function array(defaultValue: any[], cloneOnDefaultAssignment = true)
    {
        return new ArrayTemplate(registry.inferTemplateFromValues(...Object.values(defaultValue))).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function arrayOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionDefinitionAPI<InferTypeDefinitionType<T[number]>[]> & RequiredEntry & CollectionExt & GeneralExt;
    function arrayOf(...types: any[])
    {
        return new ArrayTemplate(registry.convertTypeInputsToTemplate(...types)) as any;
    }

    return { schema, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf };
}

export function generateSchemaDefinitionAPI<GeneralExt = {}, SchemaExt = {}, PrimitiveExt = {}, VariadicExt = {}, CollectionExt = {}>(BaseClass: new (...args: any[]) => any = Object)
{
    const registry = new TemplateRegistry(BaseClass);
    return generateDefinitionAPI<GeneralExt, SchemaExt, PrimitiveExt, VariadicExt, CollectionExt>(registry);
}
