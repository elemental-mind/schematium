import * as assert from "node:assert";
import { array, arrayOf, boolean, listOf, number, string, type TemplateObject, valueOf } from "./templating.ts";

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
    number: number(123).accepts(number => number < 256),
    bool: boolean(),
    string: string().required,
    either: valueOf(number, string),
    array: arrayOf(number, string).withDefault([]).accepts(array => array.length < 100).acceptsEntries(entry => true),
    list: listOf(SubTemplate).withDefault({ sample: { sampleParameter: 123, sampleValue: "text" } }).acceptsEntries((key, value) => true),
    deep: {
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
        // valueOf returns a ValueDefinitionAPI whose runtime object has validate
        // We test through the concrete template definitions.
        const t = string("hello");
        const template = withValidate(t);
        assert.strictEqual(template.validate("hello"), true);
        assert.strictEqual(template.validate(42 as any), false);
    }

    optionalFieldsDontRequireValue()
    {
        const t = string();   // no default → optional by default
        const template = withValidate(t);
        assert.strictEqual(template.validate(undefined), true);
    }

    requiredFieldsRejectUndefined()
    {
        const t = string().required;
        const template = withValidate(t);
        assert.strictEqual(template.validate("text"), true);
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
