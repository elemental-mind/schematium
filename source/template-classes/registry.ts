import type { TemplateObject, TypeOption } from "../api/definition-interface.ts";
import type { TemplateMixin } from "./base.ts";

import { ValueTemplate } from "./base.ts";
import { ArrayTemplate, RecordTemplate } from "./families/collections.ts";
import { ObjectTemplate } from "./families/objects.ts";
import { BooleanTemplate, NumberTemplate, StringTemplate } from "./families/primitives.ts";
import { VariadicTemplate } from "./families/variadics.ts";
import { LiteralTemplate } from "./families/literals.ts";
import { InternalValueTemplate } from "../api/interal-interface.ts";

/** Owns one mutually-compatible family of template classes and its resolution rules. */
export class TemplateRegistry
{
    readonly StringTemplate: typeof StringTemplate;
    readonly NumberTemplate: typeof NumberTemplate;
    readonly BooleanTemplate: typeof BooleanTemplate;
    readonly VariadicTemplate: typeof VariadicTemplate;
    readonly ObjectTemplate: typeof ObjectTemplate;
    readonly RecordTemplate: typeof RecordTemplate;
    readonly ArrayTemplate: typeof ArrayTemplate;
    readonly LiteralTemplate: typeof LiteralTemplate;
    private readonly objectTemplateCache = new WeakMap<TemplateObject, InternalValueTemplate<any>>();

    constructor(mixin: TemplateMixin)
    {
        this.StringTemplate = mixin(StringTemplate) as typeof StringTemplate;
        this.NumberTemplate = mixin(NumberTemplate) as typeof NumberTemplate;
        this.BooleanTemplate = mixin(BooleanTemplate) as typeof BooleanTemplate;
        this.VariadicTemplate = mixin(VariadicTemplate) as typeof VariadicTemplate;
        this.ObjectTemplate = mixin(ObjectTemplate) as typeof ObjectTemplate;
        this.RecordTemplate = mixin(RecordTemplate) as typeof RecordTemplate;
        this.ArrayTemplate = mixin(ArrayTemplate) as typeof ArrayTemplate;
        this.LiteralTemplate = mixin(LiteralTemplate) as typeof LiteralTemplate;

        // We declared a "registry" prop on ValueTemplate, but did not set it yet. Thus we need to set it here to keep the family together and not mix different declartion roots.
        // Bind the registry once to each fresh mixed prototype before instances exist, keeping it off instances without adding another inheritance layer.
        const mixedTemplates = [this.StringTemplate, this.NumberTemplate, this.BooleanTemplate, this.VariadicTemplate, this.ObjectTemplate, this.RecordTemplate, this.ArrayTemplate, this.LiteralTemplate];
        const builtInTemplates = [StringTemplate, NumberTemplate, BooleanTemplate, VariadicTemplate, ObjectTemplate, RecordTemplate, ArrayTemplate, LiteralTemplate];
        for (let index = 0; index < mixedTemplates.length; index++)
        {
            if (mixedTemplates[index] === builtInTemplates[index])
                throw new Error("Template mixin must return a subclass");
            Object.defineProperty(mixedTemplates[index].prototype, "registry", { value: this });
        }
    }

    inferTemplateFromValue(exampleValue: any): InternalValueTemplate<any>
    {
        switch (typeof exampleValue)
        {
            case "string": return new this.StringTemplate();
            case "number": return new this.NumberTemplate();
            case "boolean": return new this.BooleanTemplate();
            case "object":
                if (exampleValue === null)
                    throw new Error("Cannot derive template from null");
                return Array.isArray(exampleValue)
                    ? new this.ArrayTemplate(this.inferTemplateFromValues(...Object.values(exampleValue)))
                    : new this.RecordTemplate(this.inferTemplateFromValues(...Object.values(exampleValue)));
        }
        throw new Error("Cannot resolve template from example value");
    }

    inferTemplateFromValues(...exampleValues: any[]): InternalValueTemplate<any>
    {
        if (exampleValues.length === 0)
            throw new Error("Example values needed to derive template");
        if (exampleValues.length === 1)
            return this.inferTemplateFromValue(exampleValues[0]);

        const normalizedTypes = new Set<"string" | "number" | "boolean" | InternalValueTemplate<any>>();
        for (const exampleValue of exampleValues)
        {
            if (exampleValue === null)
                throw new Error("Cannot derive template from null");

            switch (typeof exampleValue)
            {
                case "string": normalizedTypes.add("string"); break;
                case "number": normalizedTypes.add("number"); break;
                case "boolean": normalizedTypes.add("boolean"); break;
                case "object": normalizedTypes.add(this.inferTemplateFromValue(exampleValue)); break;
                default: throw new Error("Cannot resolve template from example value");
            }
        }

        const templates = [...normalizedTypes].map(type =>
            typeof type === "string" ? this.convertPrimitiveTagToTemplate(type) : type);
        return templates.length === 1 ? templates[0] : new this.VariadicTemplate(...templates);
    }

    convertTypeInputToTemplate(type: TypeOption): InternalValueTemplate<any>
    {
        switch (typeof type)
        {
            case "string":
            case "number":
                return new this.LiteralTemplate(type);
            case "function":
                //here wer are given something like `number` or `boolean`. We call it to get the template.
                return type() as unknown as InternalValueTemplate<any>;
            case "object":
                if (type !== null)
                {
                    if (type instanceof ValueTemplate)
                    {
                        if (type.registry !== this)
                            throw new Error("Template belongs to a different generated API");
                        return type;
                    }
                    return this.objectTemplateFor(type as TemplateObject);
                }
        }
        throw new Error("Type constraint not recognized");
    }

    convertTypeInputsToTemplate(...type: TypeOption[]): InternalValueTemplate<any>
    {
        if (type.length === 0)
            throw new Error("Can not define template without type input");

        const templates = type.map(type => this.convertTypeInputToTemplate(type));
        return templates.length === 1 ? templates[0] : new this.VariadicTemplate(...templates);
    }

    convertPrimitiveTagToTemplate(tag: "string" | "number" | "boolean"): InternalValueTemplate<any>
    {
        switch (tag)
        {
            case "string": return new this.StringTemplate();
            case "number": return new this.NumberTemplate();
            case "boolean": return new this.BooleanTemplate();
        }
        throw new Error("Primitive tag not recognized");
    }

    objectTemplateFor(template: TemplateObject): InternalValueTemplate<any>
    {
        if (typeof template !== "object")
            throw new Error("Expected template object, but got raw value instead");

        const cached = this.objectTemplateCache.get(template);
        if (cached)
            return cached;

        const objectTemplate = new this.ObjectTemplate(template);
        return objectTemplate;
    }

    cacheObjectTemplate(template: TemplateObject, objectTemplate: InternalValueTemplate<any>): void
    {
        this.objectTemplateCache.set(template, objectTemplate);
    }

}
