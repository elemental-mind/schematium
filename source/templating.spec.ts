import * as assert from "node:assert";
import { array, arrayOf, boolean, number, object, record, recordOf, schema, string, ValidationSettings, valueOf } from "./templating.ts";
import type { ParseResult, TemplateObject, ValidationToleranceSettings } from "./templating.ts";

// Runtime access to check/validate/parseString — check wraps validate with fast:true returning boolean.
function withValidate(api: object):
    {
        check(value: any, settings?: ValidationToleranceSettings): boolean;
        validate(value: any, settings?: ValidationSettings): boolean;
        parseString(value: string, settings?: ValidationToleranceSettings): ParseResult<any>;
    }
{
    return api as any;
}

const SubTemplate = {
    sampleValue: string(),
    sampleParameter: number(123),
} satisfies TemplateObject;

const SampleTemplate = {
    //required
    number: number(123).required.accepts((v: number) => v < 256),
    //required
    bool: boolean(),
    //required
    string: string(),
    //required
    either: valueOf(number, string),
    //optional because of default
    array: arrayOf(number, string).withDefault([]).accepts((array: (number | string)[]) => array.length < 100).acceptsEntries((key: string | number, value: number | string) => true),
    //optional because of default
    list: recordOf(SubTemplate).withDefault({ sample: { sampleParameter: 123, sampleValue: "text" } }).acceptsEntries((key: string | number, value: any) => true),
    //optional, because all members are optional
    deep: {
        //optional because of default
        bar: array(["bla", "bla"])
    }
} satisfies TemplateObject;

// ============================================================
// Primitive template
// ============================================================

export class PrimitiveDefnitionTests
{
    givenValueShouldBecomeDefaultValue()
    {
        const t = string("hello");
        assert.strictEqual((t as any).default, "hello");
        assert.strictEqual((t as any).isOptional, true);
    }

    defaultValueShouldMakeValueOptional()
    {
        const t = number(42);
        assert.strictEqual((t as any).isOptional, true);
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
        const t = number(123).accepts((v: number) => v > 0);
        const template = withValidate(t);
        assert.strictEqual(template.check(5), true);
        assert.strictEqual(template.check(-1), false);
    }

    parsesStringValue()
    {
        const t = string();
        assert.deepStrictEqual(withValidate(t).parseString("hello"), { success: true, value: "hello" });
    }

    parsesNumberValue()
    {
        const t = number();
        assert.deepStrictEqual(withValidate(t).parseString("42"), { success: true, value: 42 });
    }

    throwsOnInvalidNumber()
    {
        const t = number();
        assert.strictEqual(withValidate(t).parseString("not-a-number").success, false);
    }

    parsesBooleanTrue()
    {
        const t = boolean();
        assert.deepStrictEqual(withValidate(t).parseString("true"), { success: true, value: true });
        assert.deepStrictEqual(withValidate(t).parseString("1"), { success: true, value: true });
    }

    parsesBooleanFalse()
    {
        const t = boolean();
        assert.deepStrictEqual(withValidate(t).parseString("false"), { success: true, value: false });
        assert.deepStrictEqual(withValidate(t).parseString("0"), { success: true, value: false });
    }

    throwsOnInvalidBoolean()
    {
        const t = boolean();
        assert.strictEqual(withValidate(t).parseString("yes").success, false);
    }
}

// ============================================================
// Variadic template
// ============================================================

export class VariadicDefinitionTests
{
    shouldAcknowledgeBaseTypes()
    {
        const t = valueOf(number, string);
        const template = withValidate(t);
        assert.strictEqual(template.check(42), true);
        assert.strictEqual(template.check("hello"), true);
        assert.strictEqual(template.check(false), false);
    }

    acceptsCustomValidatorOnVariadic()
    {
        const t = valueOf(number).accepts((v: number) => v > 0);
        const template = withValidate(t);
        assert.strictEqual(template.check(5), true);
        assert.strictEqual(template.check(-1), false);
    }

    validatesArrayEntriesWithAcceptsEntries()
    {
        const t = arrayOf(number).acceptsEntries((key: string | number, v: number) => v % 2 === 0);
        const template = withValidate(t);
        assert.strictEqual(template.check([2, 4, 6]), true);
        assert.strictEqual(template.check([1, 3, 5]), false);
    }

    // ============================================================
    // Variadic parseString — CLI args arrive as strings, so we need
    // to coerce numbers, booleans etc. from their string form.
    // ============================================================

    numberTakesPriorityOverStringWhenParsing()
    {
        // number (priority 0) is tried before string (priority 2) → "42" → 42
        const t = valueOf(number, string);
        assert.deepStrictEqual(withValidate(t).parseString("42"), { success: true, value: 42 });
    }

    stringIsFallbackWhenNumberCannotParse()
    {
        // number fails on "hello", string catches it
        const t = valueOf(number, string);
        assert.deepStrictEqual(withValidate(t).parseString("hello"), { success: true, value: "hello" });
    }

    userPassedOrderDoesNotAffectParsePriority()
    {
        // Even when string is listed first, number (priority 0) is tried before
        // string (priority 2), so "42" parses as number 42.
        const t = valueOf(string, number);
        assert.deepStrictEqual(withValidate(t).parseString("42"), { success: true, value: 42 });
    }

    parsesBooleanTrueFromString()
    {
        // number (priority 0) tried first — succeeds on "1" (→ 1), fails on "true";
        // boolean (priority 1) catches "true"
        const t = valueOf(number, boolean);
        assert.deepStrictEqual(withValidate(t).parseString("true"), { success: true, value: true });
        assert.deepStrictEqual(withValidate(t).parseString("1"), { success: true, value: 1 });
    }

    parsesBooleanFalseFromString()
    {
        const t = valueOf(boolean);
        assert.deepStrictEqual(withValidate(t).parseString("false"), { success: true, value: false });
        assert.deepStrictEqual(withValidate(t).parseString("0"), { success: true, value: false });
    }

    singleNumberTypeThrowsOnInvalidString()
    {
        const t = valueOf(number);
        assert.strictEqual(withValidate(t).parseString("not-a-number").success, false);
    }

    singleStringTypeReturnsIdentity()
    {
        const t = valueOf(string);
        assert.deepStrictEqual(withValidate(t).parseString("anything"), { success: true, value: "anything" });
    }

    emptyStringParsesAsStringWhenNumberIsPermitted()
    {
        // Number("") === 0, which is finite, but parseRaw guards against empty strings
        const t = valueOf(number, string);
        assert.deepStrictEqual(withValidate(t).parseString(""), { success: true, value: "" });
        assert.deepStrictEqual(withValidate(t).parseString(" "), { success: true, value: " " });
    }
}

// ============================================================
// Object template
// ============================================================

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
        const template = withValidate(t);

        // Without allowPartial, missing required field fails
        assert.strictEqual(template.check({ optional: "x" }), false);
        // With allowPartial, missing required field passes
        assert.strictEqual(template.check({ optional: "x" }, { allowPartial: true }), true);
    }

    allowUnknownsLetsExtraMembersPass()
    {
        const t = schema({
            known: string(),
        });
        const template = withValidate(t);

        // Without allowUnknowns, extra field fails
        assert.strictEqual(template.check({ known: "ok", unknown: "extra" }), false);
        // With allowUnknowns, extra field passes
        assert.strictEqual(template.check({ known: "ok", unknown: "extra" }, { allowUnknowns: true }), true);
    }

    allowPartialAndAllowUnknownsWorkTogether()
    {
        const t = schema({
            required: number(),
        });
        const template = withValidate(t);

        // Missing required field + extra field — both flags needed
        assert.strictEqual(template.check({ extra: "x" }, { allowPartial: true, allowUnknowns: true }), true);
    }

    allowPartialWithOptionalMembersStillWorks()
    {
        const t = schema({
            required: string(),
            optional: number(42),
        });
        const template = withValidate(t);

        assert.strictEqual(template.check({ optional: 123 }), false);
        // Missing optional field is fine regardless
        assert.strictEqual(template.check({ optional: 123 }, { allowPartial: true }), true);
    }

    allowPartialPropagatesToNestedObjects()
    {
        const t = schema({
            nested: {
                innerRequired: number(),
            },
        });
        const template = withValidate(t);

        assert.strictEqual(template.check({}, { allowPartial: true }), true);
        assert.strictEqual(template.check({ nested: {} }, { allowPartial: true }), true);
    }

    allowUnknownsPropagatesToNestedObjects()
    {
        const t = schema({
            nested: {
                a: string(),
            },
        });
        const template = withValidate(t);

        // Top-level allowUnknowns should also propagate to nested
        assert.strictEqual(template.check({ nested: { a: "ok", extra: true } }, { allowUnknowns: true }), true);
    }

    allowPartialDoesNotSkipTypeCheckForPresentMembers()
    {
        const t = schema({
            name: string(),
            count: number(),
        });
        const template = withValidate(t);

        // With allowPartial, a wrong type on a present member still fails
        assert.strictEqual(template.check({ name: "hello", count: "not-a-number" }, { allowPartial: true }), false);
    }

    allowUnknownsDoesNotSkipTypeCheckForKnownMembers()
    {
        const t = schema({
            name: string(),
        });
        const template = withValidate(t);

        // With allowUnknowns, a wrong type on a known member still fails
        assert.strictEqual(template.check({ name: 42, extra: "surplus" }, { allowUnknowns: true }), false);
    }

    bothFlagsDoNotMaskTypeMismatchOnRequiredFields()
    {
        const t = schema({
            required: number(),
            optional: string("default"),
        });
        const template = withValidate(t);

        // Even with both flags, type errors are still rejected
        assert.strictEqual(template.check({ required: "string", optional: "x" }, { allowPartial: true, allowUnknowns: true }), false);
    }

    bothFlagsDoNotMaskTypeMismatchInNestedObjects()
    {
        const t = schema({
            nested: {
                value: number(),
            },
        });
        const template = withValidate(t);

        // Both flags propagate to nested — type mismatch still fails
        assert.strictEqual(template.check({ nested: { value: "wrong-type" } }, { allowPartial: true, allowUnknowns: true }), false);
    }

    bothFlagsDoNotMaskTypeMismatchInLists()
    {
        const t = schema({
            items: recordOf(number),
        });
        const template = withValidate(t);

        // Type mismatch on list entries still fails
        assert.strictEqual(template.check({ items: { a: "not-a-number" } }, { allowPartial: true, allowUnknowns: true }), false);
    }

    bothFlagsDoNotMaskTypeMismatchInArrays()
    {
        const t = schema({
            items: arrayOf(number),
        });
        const template = withValidate(t);

        // Type mismatch on array entries still fails
        assert.strictEqual(template.check({ items: ["not-a-number"] }, { allowPartial: true, allowUnknowns: true }), false);
    }

    allowPartialKeepsCustomValidatorActive()
    {
        const t = schema({
            value: number().accepts((v: number) => v > 0),
        });
        const template = withValidate(t);

        // allowPartial still runs custom validators
        assert.strictEqual(template.check({}, { allowPartial: true }), true);
        assert.strictEqual(template.check({ value: -1 }, { allowPartial: true }), false);
        assert.strictEqual(template.check({ value: 5 }, { allowPartial: true }), true);
    }

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

        assert.strictEqual(template.check(validObject), true);
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

        assert.strictEqual(template.check(withoutOptional), true);
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
            assert.strictEqual(template.check(entries), false, `expected validation to fail when '${key}' is omitted`);
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
        assert.strictEqual(template.check({ name: "test" }), true);

        // With valid nested data
        assert.strictEqual(template.check({ name: "test", nested: { foo: "hello", bar: 123 } }), true);

        // An entry in nested is invalid
        assert.strictEqual(template.check({ name: "test", nested: { foo: 123, bar: 42 } } as any), false);
    }
}

// ============================================================
// Record template
// ============================================================

export class RecordDefinitionTests
{
    stringSampleObjectsGetRecognizedAsStringValues()
    {
        const t = record({ value: "text", anotherValue: "also text" });
        const template = withValidate(t);
        assert.strictEqual(template.check({ a: "foo", b: "bar" }), true);
        assert.strictEqual(template.check({ a: 1 } as any), false);
        assert.strictEqual(template.check({ a: true } as any), false);
    }

    passedSubExampleObjectsAreParsedAsRecords()
    {
        const t = record({ value: { value: "text", anotherValue: "also text" } });
        const template = withValidate(t);
        assert.strictEqual(template.check({ value: { value: "foo", anotherValue: "bar" } }), true);
        assert.strictEqual(template.check({ value: { value: "foo", newName: "bar" } }), true);
        assert.strictEqual(template.check({ value: { value: 123 } }), false);
    }

    rejectsNonObjectInput()
    {
        const t = recordOf(string);
        const template = withValidate(t);
        assert.strictEqual(template.check([] as any), false);
        assert.strictEqual(template.check(null as any), false);
        assert.strictEqual(template.check("str" as any), false);
    }

    acceptsEntriesValidator()
    {
        const t = recordOf(number).acceptsEntries((key: string | number, value: number) => value > 0);
        const template = withValidate(t);
        assert.strictEqual(template.check({ a: 1, b: 2 }), true);
        assert.strictEqual(template.check({ a: -1 }), false);
    }

    validatesStringOrNumberRecord()
    {
        const t = recordOf(string, number);
        const template = withValidate(t);
        assert.strictEqual(template.check({ a: "text", b: 42 }), true);
        assert.strictEqual(template.check({ a: true }), false);
        assert.strictEqual(template.check({ a: {} }), false);
    }

    emptyRecordIsValid()
    {
        const t = recordOf(string, number);
        const template = withValidate(t);
        assert.strictEqual(template.check({}), true);
    }

    exampleRecordWithStringOrNumber()
    {
        const t = record({ a: "hello", b: 42 });
        const template = withValidate(t);
        assert.strictEqual(template.check({ a: "world", b: 99 }), true);
        assert.strictEqual(template.check({ a: "only" }), true);
        assert.strictEqual(template.check({ a: true }), false);
        assert.strictEqual(template.check({ a: 1, b: "yep" }), true);
        assert.strictEqual(template.check({}), true);
    }

    exampleRecordAllowsAnyKeyName()
    {
        const t = record({ value: "text" });
        const template = withValidate(t);
        assert.strictEqual(template.check({ value: "foo" }), true);
        assert.strictEqual(template.check({ anyKey: "bar" }), true);
        assert.strictEqual(template.check({ "": "empty" }), true);
        assert.strictEqual(template.check({ key: "x", anotherKey: "y" }), true);
    }

    parsesRecordFromJson()
    {
        const t = recordOf(string);
        const result = withValidate(t).parseString('{"a":"x"}');
        assert.deepStrictEqual(result, { success: true, value: { a: "x" } });
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
        assert.strictEqual(template.check([1, 2, 3]), true);
        assert.strictEqual(template.check(["a"] as any), false);
    }

    validatesArrayOfMixedTypes()
    {
        const t = arrayOf(number, string);
        const template = withValidate(t);
        assert.strictEqual(template.check([1, "two", 3]), true);
        assert.strictEqual(template.check([false] as any), false);
    }

    rejectsNonArrayInput()
    {
        const t = arrayOf(number);
        const template = withValidate(t);
        assert.strictEqual(template.check({} as any), false);
        assert.strictEqual(template.check(null as any), false);
        assert.strictEqual(template.check("str" as any), false);
    }

    withDefaultSetsDefault()
    {
        const t = arrayOf(number).withDefault([1, 2, 3]) as any;
        assert.deepStrictEqual(t.default, [1, 2, 3]);
        assert.strictEqual(t.isOptional, true);
    }

    parsesArrayFromJson()
    {
        const t = arrayOf(number);
        assert.deepStrictEqual(withValidate(t).parseString("[1, 2, 3]"), { success: true, value: [1, 2, 3] });
    }
}

// ============================================================
// Default value behaviour
// ============================================================

export class DefaultValueTests
{
    objectDerivesDefaultFromChildren()
    {
        const t = schema({
            name: string("Alice"),
            age: number(30),
            role: string(), // required — no default, not marked optional
        }) as any;

        assert.deepStrictEqual(t.getDefault(), { name: "Alice", age: 30 });
    }

    objectAllChildrenOptionalWithDefaults()
    {
        const t = schema({
            x: number(10),
            y: number(20),
        }) as any;

        assert.deepStrictEqual(t.getDefault(), { x: 10, y: 20 });
        // All children are optional (because they have defaults), so the object itself is optional
        assert.strictEqual(t.isOptional, true);
    }

    objectNoChildrenWithDefault()
    {
        const t = schema({
            a: string(),
            b: number(),
        }) as any;

        assert.strictEqual(t.getDefault(), undefined);
    }

    objectSingleChildWithDefault()
    {
        const t = schema({
            label: string("fallback"),
            value: number(),
        }) as any;

        assert.deepStrictEqual(t.getDefault(), { label: "fallback" });
    }

    // --------------------------------------------------
    // Nested / recursive objects
    // --------------------------------------------------

    nestedObjectDerivesDefaultsRecursively()
    {
        const t = schema({
            config: {
                host: string("localhost"),
                port: number(8080),
            },
            debug: boolean(false),
        }) as any;

        // `config` has default { host: "localhost", port: 8080 } because both children have defaults
        assert.deepStrictEqual(t.getDefault(), { config: { host: "localhost", port: 8080 }, debug: false });
    }

    nestedObjectSomeDefaults()
    {
        const t = schema({
            outer: {
                inner1: string("default"),
                inner2: number(), // required — no default
            },
        }) as any;

        // Only inner1 has a default → outer's default is { inner1: "default" }
        assert.deepStrictEqual(t.getDefault(), { outer: { inner1: "default" } });
    }

    deepNestedObjectNoDefaults()
    {
        const t = schema({
            level1: {
                level2: {
                    value: string()
                },
            },
        }) as any;

        assert.strictEqual(t.getDefault(), undefined);
    }

    deepNestedObjectWithDefaults()
    {
        const t = schema({
            level1: {
                level2: {
                    level3: {
                        default: number(123)
                    }
                },
            },
        }) as any;

        assert.deepStrictEqual(t.getDefault(), { level1: { level2: { level3: { default: 123 } } } });
    }

    // --------------------------------------------------
    // Collection defaults
    // --------------------------------------------------

    arrayWithDefault()
    {
        const t = array([1, 2, 3]) as any;

        assert.deepStrictEqual(t.getDefault(), [1, 2, 3]);
        assert.strictEqual(t.isOptional, true);
    }

    recordWithDefault()
    {
        const t = record({ key: "value" }) as any;
        assert.deepStrictEqual(t.getDefault(), { key: "value" });
        assert.strictEqual(t.isOptional, true);
    }

    arrayOfHasNoDefault()
    {
        const t = arrayOf(number) as any;

        assert.strictEqual(t.getDefault(), undefined);
        assert.strictEqual(t.isOptional, false);
    }

    recordOfHasNoDefault()
    {
        const t = recordOf(string) as any;

        assert.strictEqual(t.getDefault(), undefined);
        assert.strictEqual(t.isOptional, false);
    }
}

// ============================================================
// getDefault — clone control via cloneDefaultOnAssignment
// ============================================================

export class DefaultCloneTests
{
    arrayByDefaultReturnsDeepClone()
    {
        const t = array([1, 2, 3]) as any;
        const clone = t.getDefault();
        assert.deepStrictEqual(clone, [1, 2, 3]);
        assert.notStrictEqual(clone, t.default);
        clone.push(4);
        assert.deepStrictEqual(t.default, [1, 2, 3]);
    }

    arrayDisabledCloneReturnsReference()
    {
        const t = array([1, 2, 3], false) as any;
        const result = t.getDefault();
        assert.deepStrictEqual(result, [1, 2, 3]);
        assert.strictEqual(result, t.default);
        result.push(4);
        assert.deepStrictEqual(t.default, [1, 2, 3, 4]);
    }

    recordDefaultReturnsDeepClone()
    {
        const t = record({ key: "value" }) as any;
        const clone = t.getDefault();
        assert.deepStrictEqual(clone, { key: "value" });
        assert.notStrictEqual(clone, t.default);
        clone.key = "changed";
        assert.deepStrictEqual(t.default, { key: "value" });
    }

    recordDisabledCloneReturnsReference()
    {
        const t = record({ key: "value" }, false) as any;
        const result = t.getDefault();
        assert.deepStrictEqual(result, { key: "value" });
        assert.strictEqual(result, t.default);
        result.key = "changed";
        assert.deepStrictEqual(t.default, { key: "changed" });
    }

    withDefaultCloneWhenAssignedTrueClonesDefault()
    {
        const defaults = [1, 2, 3];
        const t = arrayOf(number).withDefault(defaults, true) as any;
        const clone = t.getDefault();
        assert.notStrictEqual(clone, defaults);
    }

    withDefaultCloneWhenAssignedFalseSharesDefault()
    {
        const defaults = [1, 2, 3];
        const t = arrayOf(number).withDefault(defaults, false) as any;
        const result = t.getDefault();
        assert.strictEqual(result, defaults);
    }

    objectWithoutExplicitDefaultReturnsClone()
    {
        const t = schema({
            items: array([1, 2, 3]),
            label: string("test"),
        }) as any;
        const clone = t.getDefault();
        const clone2 = t.getDefault();
        assert.deepStrictEqual(clone, { items: [1, 2, 3], label: "test" });
        assert.deepStrictEqual(clone2, { items: [1, 2, 3], label: "test" });
        assert.notStrictEqual(clone, clone2);
        assert.notStrictEqual(clone.items, clone2.items);
    }

    objectWithCloneDisabledMemberReturnsMemberDefaultReference()
    {
        const defaults = [1, 2, 3];
        const t = schema({
            items: array(defaults, false),
            label: string("test"),
        }) as any;
        const result = t.getDefault();
        assert.strictEqual(result.items, defaults);
    }

    nestedObjectWithSomeNonCloneMembers()
    {
        const sharedArray = [1, 2, 3];
        const t = schema({
            outer: object({
                cloned: array([4, 5, 6]),
                shared: array(sharedArray, false),
            }),
        }) as any;

        const clone = t.getDefault();
        assert.strictEqual(clone.outer.shared, sharedArray);
    }

    objectFactoryClonedWithDefaultByDefault()
    {
        const defaultObj = {
            item: 123,
            array: [1, 2, 3],
            label: "test"
        };

        const t = object({
            item: number(),
            array: arrayOf(number),
            label: string(),
        }).withDefault(defaultObj) as any;

        const defaults = t.getDefault();

        assert.notStrictEqual(defaults, defaultObj);
        assert.notStrictEqual(defaults.array, defaultObj.array);
    }

    objectFactoryCloneEnabledByDefault()
    {
        const defaultObj = {
            item: 123,
            array: [1, 2, 3],
            label: "test"
        };

        const t = object({
            item: number(),
            array: arrayOf(number),
            label: string(),
        }).withDefault(defaultObj, false) as any;

        const defaults = t.getDefault();

        assert.strictEqual(defaults, defaultObj);
        assert.strictEqual(defaults.array, defaultObj.array);
    }

    recursiveNonCloneInNestedObject()
    {
        const shared = [10, 20, 30];
        const innerDefault = { data: shared, name: "foo" };

        const t = object({
            top: object({
                inner: object({
                    data: arrayOf(number),
                    name: string(),
                }).withDefault(innerDefault, false),
                label: string("outer"),
            }),
            meta: string("root"),
        }) as any;

        const defaults = t.getDefault();

        assert.strictEqual(defaults.top.inner, innerDefault);
    }

    mixedCloneLevelsPreserveNonCloneReferences()
    {
        const shared = [10, 20, 30];

        const t = object({
            top: object({
                inner: object({
                    data: array(shared, false),
                    name: string(),
                }),
                label: string("outer"),
            }),
            meta: string("root"),
        }) as any;

        const defaults = t.getDefault();
        assert.strictEqual(defaults.top.inner.data, shared);
    }

    // --------------------------------------------------
    // undefined default
    // --------------------------------------------------

    getDefaultsCloneReturnsUndefinedWhenNoDefault()
    {
        const t = string() as any;
        assert.strictEqual(t.getDefault(), undefined);
    }
}
