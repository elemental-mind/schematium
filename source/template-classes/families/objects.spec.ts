import * as assert from "node:assert";
import
{
    array,
    arrayOf,
    boolean,
    number,
    object,
    recordOf,
    RejectionResult,
    schema,
    string,
    valueOf,
    type TemplateObject,
} from "../../../tests/util/spec-support.ts";

const SubTemplate = {
    sampleValue: string(),
    sampleParameter: number(123),
} satisfies TemplateObject;

const SampleTemplate = {
    number: number(123).required.accepts((value: number) => value < 256),
    bool: boolean(),
    string: string(),
    either: valueOf(number, string),
    array: arrayOf(number, string).withDefault([]),
    list: recordOf(SubTemplate).withDefault({ sample: { sampleParameter: 123, sampleValue: "text" } }),
    deep: { bar: array(["bla", "bla"]) },
} satisfies TemplateObject;


export class ObjectDefinitionTests
{
    // --------------------------------------------------
    // Partial / superfluous member validation
    // --------------------------------------------------

    allowPartialLetsMissingRequiredMembersPass()
    {
        const t = schema({
            required: string(),
            optional: string("default"),
        });


        // Without allowPartial, missing required field fails
        assert.strictEqual(t.check({ optional: "x" }), false);
        // With allowPartial, missing required field passes
        assert.strictEqual(t.check({ optional: "x" }, { allowPartial: true }), true);
    }

    allowUnknownsLetsExtraMembersPass()
    {
        const t = schema({
            known: string(),
        });


        // Without allowUnknowns, extra field fails
        assert.strictEqual(t.check({ known: "ok", unknown: "extra" }), false);
        // With allowUnknowns, extra field passes
        assert.strictEqual(t.check({ known: "ok", unknown: "extra" }, { allowUnknowns: true }), true);
    }

    allowPartialAndAllowUnknownsWorkTogether()
    {
        const t = schema({
            required: number(),
        });


        // Missing required field + extra field â€” both flags needed
        assert.strictEqual(t.check({ extra: "x" }, { allowPartial: true, allowUnknowns: true }), true);
    }

    allowPartialWithOptionalMembersStillWorks()
    {
        const t = schema({
            required: string(),
            optional: number(42),
        });


        assert.strictEqual(t.check({ optional: 123 }), false);
        // Missing optional field is fine regardless
        assert.strictEqual(t.check({ optional: 123 }, { allowPartial: true }), true);
    }

    allowPartialPropagatesToNestedObjects()
    {
        const t = schema({
            nested: {
                innerRequired: number(),
            },
        });


        assert.strictEqual(t.check({}, { allowPartial: true }), true);
        assert.strictEqual(t.check({ nested: {} }, { allowPartial: true }), true);
    }

    allowUnknownsPropagatesToNestedObjects()
    {
        const t = schema({
            nested: {
                a: string(),
            },
        });


        // Top-level allowUnknowns should also propagate to nested
        assert.strictEqual(t.check({ nested: { a: "ok", extra: true } }, { allowUnknowns: true }), true);
    }

    allowPartialDoesNotSkipTypeCheckForPresentMembers()
    {
        const t = schema({
            name: string(),
            count: number(),
        });


        // With allowPartial, a wrong type on a present member still fails
        assert.strictEqual(t.check({ name: "hello", count: "not-a-number" }, { allowPartial: true }), false);
    }

    allowUnknownsDoesNotSkipTypeCheckForKnownMembers()
    {
        const t = schema({
            name: string(),
        });


        // With allowUnknowns, a wrong type on a known member still fails
        assert.strictEqual(t.check({ name: 42, extra: "surplus" }, { allowUnknowns: true }), false);
    }

    bothFlagsDoNotMaskTypeMismatchOnRequiredFields()
    {
        const t = schema({
            required: number(),
            optional: string("default"),
        });


        // Even with both flags, type errors are still rejected
        assert.strictEqual(t.check({ required: "string", optional: "x" }, { allowPartial: true, allowUnknowns: true }), false);
    }

    bothFlagsDoNotMaskTypeMismatchInNestedObjects()
    {
        const t = schema({
            nested: {
                value: number(),
            },
        });


        // Both flags propagate to nested â€” type mismatch still fails
        assert.strictEqual(t.check({ nested: { value: "wrong-type" } }, { allowPartial: true, allowUnknowns: true }), false);
    }

    bothFlagsDoNotMaskTypeMismatchInLists()
    {
        const t = schema({
            items: recordOf(number),
        });


        // Type mismatch on list entries still fails
        assert.strictEqual(t.check({ items: { a: "not-a-number" } }, { allowPartial: true, allowUnknowns: true }), false);
    }

    bothFlagsDoNotMaskTypeMismatchInArrays()
    {
        const t = schema({
            items: arrayOf(number),
        });


        // Type mismatch on array entries still fails
        assert.strictEqual(t.check({ items: ["not-a-number"] }, { allowPartial: true, allowUnknowns: true }), false);
    }

    allowPartialKeepsCustomValidatorActive()
    {
        const t = schema({
            value: number().accepts((v: number) => v > 0),
        });


        // allowPartial still runs custom validators
        assert.strictEqual(t.check({}, { allowPartial: true }), true);
        assert.strictEqual(t.check({ value: -1 }, { allowPartial: true }), false);
        assert.strictEqual(t.check({ value: 5 }, { allowPartial: true }), true);
    }

    validatesValidConcreteObject()
    {
        const t = schema(SampleTemplate);


        const validObject = {
            number: 42,
            bool: true,
            string: "hello",
            either: 1,
            array: [1, 2],
            list: { sample: { sampleParameter: 123, sampleValue: "text" } },
            deep: { bar: ["a", "b"] },
        };

        assert.strictEqual(t.check(validObject), true);
    }

    optionalFieldsDontRequireValue()
    {
        const t = schema(SampleTemplate);


        // All required fields present; optional fields (array, list, deep) omitted
        const withoutOptional = {
            number: 42,
            bool: true,
            string: "hello",
            either: 1,
        };

        assert.strictEqual(t.check(withoutOptional), true);
    }

    requiredFieldsRejectUndefined()
    {
        const t = schema(SampleTemplate);


        const base = {
            number: 42,
            bool: true,
            string: "hello",
            either: 1,
            array: [1, 2],
            list: { sample: { sampleParameter: 123, sampleValue: "text" } },
            deep: { bar: ["a", "b"] },
        };

        // Only required fields are tested; optional fields (array, list, deep) are excluded
        for (const key of ["number", "bool", "string", "either"] as const)
        {
            const { ...entries } = base;
            (entries[key] as any) = undefined;
            assert.strictEqual(t.check(entries), false, `expected validation to fail when '${key}' is omitted`);
        }
    }

    subTemplateIsOptionalIfAllMembersOfSubTemplateAreOptional()
    {
        const TemplateWithOptionalNested = {
            name: string("default"),
            nested: {
                foo: string("default"),
                bar: number(42),
            }
        } satisfies TemplateObject;

        const t = schema(TemplateWithOptionalNested);


        // All members of nested are optional (due to defaults), so nested itself is optional
        assert.strictEqual(t.check({ name: "test" }), true);

        // With valid nested data
        assert.strictEqual(t.check({ name: "test", nested: { foo: "hello", bar: 123 } }), true);

        // An entry in nested is invalid
        assert.strictEqual(t.check({ name: "test", nested: { foo: 123, bar: 42 } }), false);
    }
}

export class ObjectFactoryTests
{
    objectFactoryCreatesValidTemplate()
    {
        const t = object({
            name: string(),
            age: number(),
        });

        assert.strictEqual(t.check({ name: "Alice", age: 30 }), true);
        assert.strictEqual(t.check({ name: "Alice" }), false);
    }

    objectFactoryWithDefaults()
    {
        const t = object({
            items: array([1, 2, 3]),
            label: string("test"),
        });

        assert.deepStrictEqual(t.getDefault(), { items: [1, 2, 3], label: "test" });
    }

    objectFactoryValidateReturnsIssues()
    {
        const t = object({
            value: number(),
        });

        const result = t.validate({ value: "wrong" }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue from object factory validation");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }
}