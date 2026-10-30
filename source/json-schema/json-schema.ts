import type { InternalValueTemplate } from "../api/interal-interface.ts";
import type { ValidationTolerances } from "../api/validation-interface.ts";

export interface JSONSchema
{
    $schema?: string;
    $ref?: string;
    type?: "string" | "number" | "boolean" | "object" | "array";
    const?: string | number | boolean;
    enum?: (string | number | boolean)[];
    anyOf?: JSONSchema[];
    properties?: Record<string, JSONSchema>;
    required?: string[];
    additionalProperties?: boolean | JSONSchema;
    items?: JSONSchema;
    default?: unknown;
    [keyword: string]: unknown;
}

/** Builds nested subschemas, tracking their JSON pointers so cyclic templates resolve to a `$ref` of their ancestor. */
export class JSONSchemaContext
{
    static readonly dialect = "https://json-schema.org/draft/2020-12/schema";

    readonly allowPartial: boolean;
    readonly allowUnknowns: boolean;
    private pointer = "#";
    private readonly ancestorPointers = new Map<InternalValueTemplate<any>, string>();

    constructor(tolerances: ValidationTolerances)
    {
        this.allowPartial = tolerances.allowPartial ?? false;
        this.allowUnknowns = tolerances.allowUnknowns ?? false;
    }

    buildSchema(template: InternalValueTemplate<any>, ...pointerSegments: (string | number)[]): JSONSchema
    {
        const ancestorPointer = this.ancestorPointers.get(template);
        if (ancestorPointer !== undefined)
            return { $ref: ancestorPointer };

        const parentPointer = this.pointer;
        for (const segment of pointerSegments)
            this.pointer += "/" + encodeURIComponent(String(segment).replaceAll("~", "~0").replaceAll("/", "~1"));

        this.ancestorPointers.set(template, this.pointer);
        const schema = template.buildJSONSchema(this);
        this.ancestorPointers.delete(template);
        this.pointer = parentPointer;
        return schema;
    }
}
