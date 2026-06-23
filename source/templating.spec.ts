import * as assert from "node:assert";
import { array, arrayOf, boolean, list, listOf, number, schema, string, type TemplateObject, valueOf } from "./templating.ts";

// Runtime access to validate/parseString — not on the public API type but present on instances.
function withValidate(api: object): { validate(value: any): boolean; parseString(value: string): any; }
{
    return api as any;
}

const SubTemplate = {
    sampleValue: string(),
    sampleParameter: number(123),
} satisfies TemplateObject;

const SampleTemplate = {
    //required
    number: number(123).required.accepts(number => number < 256),
    //required
    bool: boolean(),
    //required
    string: string(),
    //required
    either: valueOf(number, string),
    //optional because of default
    array: arrayOf(number, string).withDefault([]).accepts(array => array.length < 100).acceptsEntries(entry => true),
    //optional because of default
    list: listOf(SubTemplate).withDefault({ sample: { sampleParameter: 123, sampleValue: "text" } }).acceptsEntries((key, value) => true),
    //optional, because all members are optional
    deep: {
        //optional because of default
        bar: array(["bla", "bla"])
    }
} satisfies TemplateObject;

// ============================================================
// Definition behaviour
// ============================================================

export class DefinitionBehaviourTests
{
    givenValueShouldBecomeDefaultValue()
    {
        const t = string("hello");
        assert.strictEqual((t as any).default, "hello");
        assert.strictEqual((t as any).isOptional, false);
    }

    givenValueShouldMakeValueRequired()
    {
        const t = number(42);
        assert.strictEqual((t as any).isOptional, false);
    }

    optionalModifierMakesValueOptional()
    {
        const t = string().optional;
        assert.strictEqual((t as any).isOptional, true);
    }

    requiredModifierMakesValueRequired()
    {
        const t = string().optional.required;
        assert.strictEqual((t as any).isOptional, false);
    }

    acceptsCustomValidator()
    {
        const t = number(123).accepts(v => v > 0);
        const template = withValidate(t);
        assert.strictEqual(template.validate(5), true);
        assert.strictEqual(template.validate(-1), false);
    }
}

// ============================================================
// Object template
// ============================================================

export class ObjectDefinitionTests
{
    validatesValidConcreteObject()
    {
        const t = schema(SampleTemplate);
        const template = withValidate(t);

        const validObject = {
            number: 42,
            bool: true,
            string: "hello",
            either: 1,
            array: [1, 2],
            list: { sample: { sampleParameter: 123, sampleValue: "text" } },
            deep: { bar: ["a", "b"] },
        };

        assert.strictEqual(template.validate(validObject), true);
    }

    optionalFieldsDontRequireValue()
    {
        const t = schema(SampleTemplate);
        const template = withValidate(t);

        // All required fields present; optional fields (array, list, deep) omitted
        const withoutOptional = {
            number: 42,
            bool: true,
            string: "hello",
            either: 1,
        };

        assert.strictEqual(template.validate(withoutOptional), true);
    }

    requiredFieldsRejectUndefined()
    {
        const t = schema(SampleTemplate);
        const template = withValidate(t);

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
            assert.strictEqual(template.validate(entries), false, `expected validation to fail when '${key}' is omitted`);
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
        const template = withValidate(t);

        // All members of nested are optional (due to defaults), so nested itself is optional
        assert.strictEqual(template.validate({ name: "test" }), true);

        // With valid nested data
        assert.strictEqual(template.validate({ name: "test", nested: { foo: "hello", bar: 123 } }), true);

        // An entry in nested is invalid
        assert.strictEqual(template.validate({ name: "test", nested: { foo: 123, bar: 42 } } as any), false);
    }
}

// ============================================================
// List template
// ============================================================

export class ListDefinitionTests
{
    stringSampleObjectsGetRecognizedAsStringValues()
    {
        const t = listOf(string);
        const template = withValidate(t);
        assert.strictEqual(template.validate({ a: "foo", b: "bar" }), true);
        assert.strictEqual(template.validate({ a: 1 } as any), false);
    }

    passedSubObjectsAreParsedAsLists()
    {
        const t = listOf(string);
        const asParsed = t as any;
        const raw = asParsed.parseString('{"a":"x","b":"y"}');
        assert.deepStrictEqual(raw, { a: "x", b: "y" });
    }

    rejectsNonObjectInput()
    {
        const t = listOf(string);
        const template = withValidate(t);
        assert.strictEqual(template.validate([] as any), false);
        assert.strictEqual(template.validate(null as any), false);
        assert.strictEqual(template.validate("str" as any), false);
    }

    acceptsEntriesValidator()
    {
        const t = listOf(number).acceptsEntries((key, value) => value > 0);
        const template = withValidate(t);
        assert.strictEqual(template.validate({ a: 1, b: 2 }), true);
        assert.strictEqual(template.validate({ a: -1 }), false);
    }
}

// ============================================================
// Array template
// ============================================================

export class ArrayDefinitionTests
{
    validatesArrayOfNumbers()
    {
        const t = arrayOf(number);
        const template = withValidate(t);
        assert.strictEqual(template.validate([1, 2, 3]), true);
        assert.strictEqual(template.validate(["a"] as any), false);
    }

    validatesArrayOfMixedTypes()
    {
        const t = arrayOf(number, string);
        const template = withValidate(t);
        assert.strictEqual(template.validate([1, "two", 3]), true);
        assert.strictEqual(template.validate([false] as any), false);
    }

    rejectsNonArrayInput()
    {
        const t = arrayOf(number);
        const template = withValidate(t);
        assert.strictEqual(template.validate({} as any), false);
        assert.strictEqual(template.validate(null as any), false);
        assert.strictEqual(template.validate("str" as any), false);
    }

    withDefaultSetsDefault()
    {
        const t = arrayOf(number).withDefault([1, 2, 3]);
        const raw = t as any;
        assert.deepStrictEqual(raw.default, [1, 2, 3]);
        assert.strictEqual(raw.isOptional, false);
    }
}

// ============================================================
// Parsing
// ============================================================

export class ParsingTests
{
    parsesStringValue()
    {
        const t = string();
        assert.strictEqual(withValidate(t).parseString("hello"), "hello");
    }

    parsesNumberValue()
    {
        const t = number();
        assert.strictEqual(withValidate(t).parseString("42"), 42);
    }

    throwsOnInvalidNumber()
    {
        const t = number();
        assert.throws(() => withValidate(t).parseString("not-a-number"), /Cannot parse/);
    }

    parsesBooleanTrue()
    {
        const t = boolean();
        assert.strictEqual(withValidate(t).parseString("true"), true);
        assert.strictEqual(withValidate(t).parseString("1"), true);
    }

    parsesBooleanFalse()
    {
        const t = boolean();
        assert.strictEqual(withValidate(t).parseString("false"), false);
        assert.strictEqual(withValidate(t).parseString("0"), false);
    }

    throwsOnInvalidBoolean()
    {
        const t = boolean();
        assert.throws(() => withValidate(t).parseString("yes"), /Cannot parse/);
    }

    parsesArrayFromJson()
    {
        const t = arrayOf(number);
        assert.deepStrictEqual(withValidate(t).parseString("[1, 2, 3]"), [1, 2, 3]);
    }

    parsesListFromJson()
    {
        const t = listOf(string);
        const result = withValidate(t).parseString('{"a":"x"}');
        assert.deepStrictEqual(result, { a: "x" });
    }
}

// ============================================================
// Variadic / valueOf
// ============================================================

export class ValidationTests
{
    shouldAcknowledgeBaseTypes()
    {
        const t = valueOf(number, string);
        const template = withValidate(t);
        assert.strictEqual(template.validate(42), true);
        assert.strictEqual(template.validate("hello"), true);
        assert.strictEqual(template.validate(false), false);
    }

    acceptsCustomValidatorOnVariadic()
    {
        const t = valueOf(number).accepts(v => (v as number) > 0);
        const template = withValidate(t);
        assert.strictEqual(template.validate(5), true);
        assert.strictEqual(template.validate(-1), false);
    }

    validatesArrayEntriesWithAcceptsEntries()
    {
        const t = arrayOf(number).acceptsEntries(v => (v as number) % 2 === 0);
        const template = withValidate(t);
        assert.strictEqual(template.validate([2, 4, 6]), true);
        assert.strictEqual(template.validate([1, 3, 5]), false);
    }
}
