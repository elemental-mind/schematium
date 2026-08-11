import { TemplateRegistry } from "../template-classes/registry.ts";
import type {
    CheckAPI,
    CollectionTemplateAPI,
    InferSchemaType,
    InferTypeDefinitionType,
    OptionalEntry,
    RequiredEntry,
    SchemaAPI,
    TemplateAPI,
    TemplateObject,
    TypeOption,
} from "./templating-contracts.ts";

export function generateTemplatingAPI<GeneralExt = {}, SchemaExt = {}, PrimitiveExt = {}, VariadicExt = {}, CollectionExt = {}>(BaseClass: new (...args: any[]) => any = Object)
{
    const registry = new TemplateRegistry(BaseClass);
    const {
        StringTemplate,
        NumberTemplate,
        BooleanTemplate,
        VariadicTemplate,
        ObjectTemplate,
        RecordTemplate,
        ArrayTemplate,
        LiteralTemplate,
    } = registry;

    function schema<T extends TemplateObject>(inputSchema: T): SchemaAPI<InferSchemaType<T>> & SchemaExt & GeneralExt;
    function schema(inputSchema: any)
    {
        return ObjectTemplate.fromTemplateObject(inputSchema) as any;
    }

    function string(): TemplateAPI<string> & RequiredEntry & PrimitiveExt & GeneralExt;
    function string(defaultValue: string): CheckAPI<string> & OptionalEntry & PrimitiveExt & GeneralExt;
    function string(defaultValue?: string)
    {
        return defaultValue !== undefined ? new StringTemplate().withDefault(defaultValue) : new StringTemplate();
    }

    function number(): TemplateAPI<number> & RequiredEntry & PrimitiveExt & GeneralExt;
    function number(defaultValue: number): CheckAPI<number> & OptionalEntry & PrimitiveExt & GeneralExt;
    function number(defaultValue?: number)
    {
        return defaultValue !== undefined ? new NumberTemplate().withDefault(defaultValue) : new NumberTemplate();
    }

    function boolean(): TemplateAPI<boolean> & RequiredEntry & PrimitiveExt & GeneralExt;
    function boolean(defaultValue: boolean): CheckAPI<boolean> & OptionalEntry & PrimitiveExt & GeneralExt;
    function boolean(defaultValue?: boolean)
    {
        return defaultValue !== undefined ? new BooleanTemplate().withDefault(defaultValue) : new BooleanTemplate();
    }

    function valueOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): TemplateAPI<InferTypeDefinitionType<T[number]>> & RequiredEntry & VariadicExt & GeneralExt;
    function valueOf(...types: any[])
    {
        return registry.typeFromInputs(...types) as any;
    }

    function oneOf<const T extends readonly [string | number, ...(string | number)[]]>(...possibleValues: T): TemplateAPI<T[number]> & RequiredEntry & VariadicExt & GeneralExt;
    function oneOf(...possibleValues: any[])
    {
        return new VariadicTemplate(...possibleValues.map(value => new LiteralTemplate(value))) as any;
    }

    function object<T extends TemplateObject>(value: T): TemplateAPI<InferSchemaType<T>> & RequiredEntry & PrimitiveExt & GeneralExt;
    function object(value: any)
    {
        return ObjectTemplate.fromTemplateObject(value) as any;
    }

    function record<T>(defaultValue: Record<string, T>, cloneOnDefaultAssignment?: boolean): CollectionTemplateAPI<Record<string, T>> & OptionalEntry & CollectionExt & GeneralExt;
    function record(defaultValue: Record<string, any>, cloneOnDefaultAssignment: boolean = true)
    {
        return new RecordTemplate(registry.typeFromExamples(...Object.values(defaultValue))).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function recordOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionTemplateAPI<Record<string, InferTypeDefinitionType<T[number]>>> & RequiredEntry & CollectionExt & GeneralExt;
    function recordOf(...types: any[])
    {
        return new RecordTemplate(registry.typeFromInputs(...types)) as any;
    }

    function array<T>(defaultValue: T[], cloneOnDefaultAssignment?: boolean): CollectionTemplateAPI<T[]> & OptionalEntry & CollectionExt & GeneralExt;
    function array(defaultValue: any[], cloneOnDefaultAssignment = true)
    {
        return new ArrayTemplate(registry.typeFromExamples(...Object.values(defaultValue))).withDefault(defaultValue, cloneOnDefaultAssignment);
    }

    function arrayOf<const T extends readonly [TypeOption, ...TypeOption[]]>(...types: T): CollectionTemplateAPI<InferTypeDefinitionType<T[number]>[]> & RequiredEntry & CollectionExt & GeneralExt;
    function arrayOf(...types: any[])
    {
        return new ArrayTemplate(registry.typeFromInputs(...types)) as any;
    }

    return { schema, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf };
}

export const {
    schema,
    string,
    number,
    boolean,
    object,
    valueOf,
    oneOf,
    record,
    recordOf,
    array,
    arrayOf,
} = generateTemplatingAPI();
