import type { TemplateObject, TypeOption } from "../api/templating-contracts.ts";
import type { InternalValueTemplate, ValueTemplateConstructor } from "./base.ts";
import type { ArrayTemplateConstructor, CollectionTemplateConstructor, RecordTemplateConstructor } from "./families/collections.ts";
import type { ObjectTemplateConstructor } from "./families/objects.ts";
import type { PrimitiveTemplateConstructor } from "./families/primitives.ts";
import type { VariadicTemplateConstructor } from "./families/variadics.ts";
import type { LiteralTemplateConstructor } from "./families/literals.ts";

import { createValueTemplate } from "./base.ts";
import { createCollectionTemplates } from "./families/collections.ts";
import { createObjectTemplate } from "./families/objects.ts";
import { createPrimitiveTemplates } from "./families/primitives.ts";
import { createVariadicTemplate } from "./families/variadics.ts";
import { createLiteralTemplate } from "./families/literals.ts";

/** Owns one mutually-compatible family of template classes and its resolution rules. */
export class TemplateRegistry
{
    readonly ValueTemplate: ValueTemplateConstructor;
    readonly StringTemplate: PrimitiveTemplateConstructor<string>;
    readonly NumberTemplate: PrimitiveTemplateConstructor<number>;
    readonly BooleanTemplate: PrimitiveTemplateConstructor<boolean>;
    readonly VariadicTemplate: VariadicTemplateConstructor;
    readonly ObjectTemplate: ObjectTemplateConstructor;
    readonly CollectionTemplate: CollectionTemplateConstructor;
    readonly RecordTemplate: RecordTemplateConstructor;
    readonly ArrayTemplate: ArrayTemplateConstructor;
    readonly LiteralTemplate: LiteralTemplateConstructor;

    constructor(BaseClass: new (...args: any[]) => any = Object)
    {
        this.ValueTemplate = createValueTemplate(BaseClass, this);

        const primitives = createPrimitiveTemplates(this.ValueTemplate);
        this.StringTemplate = primitives.StringTemplate;
        this.NumberTemplate = primitives.NumberTemplate;
        this.BooleanTemplate = primitives.BooleanTemplate;

        const collections = createCollectionTemplates(this.ValueTemplate);
        this.CollectionTemplate = collections.CollectionTemplate;
        this.RecordTemplate = collections.RecordTemplate;
        this.ArrayTemplate = collections.ArrayTemplate;

        this.ObjectTemplate = createObjectTemplate(this.ValueTemplate, this);
        this.LiteralTemplate = createLiteralTemplate(this.ValueTemplate, this);

        this.VariadicTemplate = createVariadicTemplate(this.ValueTemplate);
    }

    typeFromExample(exampleValue: any): InternalValueTemplate<any>
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
                    ? new this.ArrayTemplate(this.typeFromExamples(...Object.values(exampleValue)))
                    : new this.RecordTemplate(this.typeFromExamples(...Object.values(exampleValue)));
        }
        throw new Error("Cannot resolve template from example value");
    }

    typeFromExamples(...exampleValues: any[]): InternalValueTemplate<any>
    {
        if (exampleValues.length === 0)
            throw new Error("Example values needed to derive template");
        if (exampleValues.length === 1)
            return this.typeFromExample(exampleValues[0]);

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
                case "object": normalizedTypes.add(this.typeFromExample(exampleValue)); break;
                default: throw new Error("Cannot resolve template from example value");
            }
        }

        const templates = [...normalizedTypes].map(type =>
            typeof type === "string" ? this.typeFromPrimitiveTag(type) : type);
        return templates.length === 1 ? templates[0] : new this.VariadicTemplate(...templates);
    }

    typeFromInput(typeOption: TypeOption): InternalValueTemplate<any>
    {
        switch (typeof typeOption)
        {
            case "string":
            case "number": return new this.LiteralTemplate(typeOption);
            case "function": return typeOption() as unknown as InternalValueTemplate<any>;
            case "object":
                if (typeOption !== null)
                    return typeOption instanceof this.ValueTemplate
                        ? typeOption
                        : this.ObjectTemplate.fromTemplateObject(typeOption as TemplateObject);
        }
        throw new Error("Type constraint not recognized");
    }

    typeFromInputs(...types: TypeOption[]): InternalValueTemplate<any>
    {
        if (types.length === 0)
            throw new Error("Can not define template without type input");

        const templates = types.map(type => this.typeFromInput(type));
        return templates.length === 1 ? templates[0] : new this.VariadicTemplate(...templates);
    }

    typeFromPrimitiveTag(tag: "string" | "number" | "boolean"): InternalValueTemplate<any>
    {
        switch (tag)
        {
            case "string": return new this.StringTemplate();
            case "number": return new this.NumberTemplate();
            case "boolean": return new this.BooleanTemplate();
        }
        throw new Error("Primitive tag not recognized");
    }
}
