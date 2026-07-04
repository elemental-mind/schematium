import * as assert from "node:assert";
import { generateTemplatingAPI } from "./templating.ts";
import type { ParseResult, TemplateObject, ValidationAPI, ValidationResult, ValidationSettings, ValidationTolerances, ValueType } from "./templating.ts";
import { Debug } from "unitium";
import type { ParseSuccessResult } from "./templating.ts";

function assertParseSuccess<T>(result: ParseResult<T>, expectedValue: T): void
{
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual((result as ParseSuccessResult<T>).value, expectedValue);
}

export interface ValidationAPIInjection
{
    isOptional: boolean;
    check(value: unknown, settings?: ValidationTolerances): value is ValueType<this>;
    validate(value: unknown, settings?: ValidationSettings): ValidationResult;
    parseString(value: string, settings?: ValidationSettings): ParseResult<ValueType<this>>;
    getDefault(): Partial<ValueType<this>> | undefined;
}

const { schema, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf } = generateTemplatingAPI<ValidationAPIInjection>();

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
        assert.strictEqual((t).isOptional, true);
    }

    defaultValueShouldMakeValueOptional()
    {
        const t = number(42);
        assert.strictEqual((t).isOptional, true);
    }

    optionalModifierMakesValueOptional()
    {
        const t = string().optional;
        assert.strictEqual((t).isOptional, true);
    }

    requiredModifierMakesValueRequired()
    {
        const t = string().optional.required;
        assert.strictEqual((t).isOptional, false);
    }

    acceptsCustomValidator()
    {
        const t = number(123).accepts((v: number) => v > 0);

        assert.strictEqual(t.check(5), true);
        assert.strictEqual(t.check(-1), false);
    }

    parsesStringValue()
    {
        const t = string();
        assertParseSuccess(t.parseString("hello"), "hello");
    }

    parsesNumberValue()
    {
        const t = number();
        assertParseSuccess(t.parseString("42"), 42);
    }

    throwsOnInvalidNumber()
    {
        const t = number();
        assert.strictEqual(t.parseString("not-a-number").success, false);
    }

    parsesBooleanTrue()
    {
        const t = boolean();
        assertParseSuccess(t.parseString("true"), true);
        assertParseSuccess(t.parseString("1"), true);
    }

    parsesBooleanFalse()
    {
        const t = boolean();
        assertParseSuccess(t.parseString("false"), false);
        assertParseSuccess(t.parseString("0"), false);
    }

    throwsOnInvalidBoolean()
    {
        const t = boolean();
        assert.strictEqual(t.parseString("yes").success, false);
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

        assert.strictEqual(t.check(42), true);
        assert.strictEqual(t.check("hello"), true);
        assert.strictEqual(t.check(false), false);
    }

    acceptsCustomValidatorOnVariadic()
    {
        const t = valueOf(number).accepts((v: number) => v > 0);

        assert.strictEqual(t.check(5), true);
        assert.strictEqual(t.check(-1), false);
    }

    validatesArrayEntriesWithAcceptsEntries()
    {
        const t = arrayOf(number).acceptsEntries((key: string | number, v: number) => v % 2 === 0);

        assert.strictEqual(t.check([2, 4, 6]), true);
        assert.strictEqual(t.check([1, 3, 5]), false);
    }

    // ============================================================
    // Variadic parseString — CLI args arrive as strings, so we need
    // to coerce numbers, booleans etc. from their string form.
    // ============================================================

    numberTakesPriorityOverStringWhenParsing()
    {
        // number (priority 0) is tried before string (priority 2) → "42" → 42
        const t = valueOf(number, string);
        assertParseSuccess(t.parseString("42"), 42);
    }

    stringIsFallbackWhenNumberCannotParse()
    {
        // number fails on "hello", string catches it
        const t = valueOf(number, string);
        assertParseSuccess(t.parseString("hello"), "hello");
    }

    userPassedOrderDoesNotAffectParsePriority()
    {
        // Even when string is listed first, number (priority 0) is tried before
        // string (priority 2), so "42" parses as number 42.
        const t = valueOf(string, number);
        assertParseSuccess(t.parseString("42"), 42);
    }

    parsesBooleanTrueFromString()
    {
        // number (priority 0) tried first — succeeds on "1" (→ 1), fails on "true";
        // boolean (priority 1) catches "true"
        const t = valueOf(number, boolean);
        assertParseSuccess(t.parseString("true"), true);
        assertParseSuccess(t.parseString("1"), 1);
    }

    parsesBooleanFalseFromString()
    {
        const t = valueOf(boolean);
        assertParseSuccess(t.parseString("false"), false);
        assertParseSuccess(t.parseString("0"), false);
    }

    singleNumberTypeThrowsOnInvalidString()
    {
        const t = valueOf(number);
        assert.strictEqual(t.parseString("not-a-number").success, false);
    }

    singleStringTypeReturnsIdentity()
    {
        const t = valueOf(string);
        assertParseSuccess(t.parseString("anything"), "anything");
    }

    emptyStringParsesAsStringWhenNumberIsPermitted()
    {
        // Number("") === 0, which is finite, but parseRaw guards against empty strings
        const t = valueOf(number, string);
        assertParseSuccess(t.parseString(""), "");
        assertParseSuccess(t.parseString(" "), " ");
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


        // Missing required field + extra field — both flags needed
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


        // Both flags propagate to nested — type mismatch still fails
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

// ============================================================
// Record template
// ============================================================

export class RecordDefinitionTests
{
    stringSampleObjectsGetRecognizedAsStringValues()
    {
        const t = record({ value: "text", anotherValue: "also text" });

        assert.strictEqual(t.check({ a: "foo", b: "bar" }), true);
        assert.strictEqual(t.check({ a: 1 }), false);
        assert.strictEqual(t.check({ a: true }), false);
    }

    passedSubExampleObjectsAreParsedAsRecords()
    {
        const t = record({ value: { value: "text", anotherValue: "also text" } });

        assert.strictEqual(t.check({ value: { value: "foo", anotherValue: "bar" } }), true);
        assert.strictEqual(t.check({ value: { value: "foo", newName: "bar" } }), true);
        assert.strictEqual(t.check({ value: { value: 123 } }), false);
    }

    rejectsNonObjectInput()
    {
        const t = recordOf(string);

        assert.strictEqual(t.check([]), false);
        assert.strictEqual(t.check(null), false);
        assert.strictEqual(t.check("str"), false);
    }

    acceptsEntriesValidator()
    {
        const t = recordOf(number).acceptsEntries((key: string | number, value: number) => value > 0);

        assert.strictEqual(t.check({ a: 1, b: 2 }), true);
        assert.strictEqual(t.check({ a: -1 }), false);
    }

    validatesStringOrNumberRecord()
    {
        const t = recordOf(string, number);

        assert.strictEqual(t.check({ a: "text", b: 42 }), true);
        assert.strictEqual(t.check({ a: true }), false);
        assert.strictEqual(t.check({ a: {} }), false);
    }

    emptyRecordIsValid()
    {
        const t = recordOf(string, number);

        assert.strictEqual(t.check({}), true);
    }

    exampleRecordWithStringOrNumber()
    {
        const t = record({ a: "hello", b: 42 });

        assert.strictEqual(t.check({ a: "world", b: 99 }), true);
        assert.strictEqual(t.check({ a: "only" }), true);
        assert.strictEqual(t.check({ a: true }), false);
        assert.strictEqual(t.check({ a: 1, b: "yep" }), true);
        assert.strictEqual(t.check({}), true);
    }

    exampleRecordAllowsAnyKeyName()
    {
        const t = record({ value: "text" });

        assert.strictEqual(t.check({ value: "foo" }), true);
        assert.strictEqual(t.check({ anyKey: "bar" }), true);
        assert.strictEqual(t.check({ "": "empty" }), true);
        assert.strictEqual(t.check({ key: "x", anotherKey: "y" }), true);
    }

    parsesRecordFromJson()
    {
        const t = recordOf(string);
        const result = t.parseString('{"a":"x"}');
        assertParseSuccess(result, { a: "x" });
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

        assert.strictEqual(t.check([1, 2, 3]), true);
        assert.strictEqual(t.check(["a"]), false);
    }

    validatesArrayOfMixedTypes()
    {
        const t = arrayOf(number, string);

        assert.strictEqual(t.check([1, "two", 3]), true);
        assert.strictEqual(t.check([false]), false);
    }

    rejectsNonArrayInput()
    {
        const t = arrayOf(number);

        assert.strictEqual(t.check({}), false);
        assert.strictEqual(t.check(null), false);
        assert.strictEqual(t.check("str"), false);
    }

    withDefaultSetsDefault()
    {
        const t = arrayOf(number).withDefault([1, 2, 3]);
        assert.deepStrictEqual((t as any).default, [1, 2, 3]);
        assert.strictEqual(t.isOptional, true);
    }

    parsesArrayFromJson()
    {
        const t = arrayOf(number);
        assertParseSuccess(t.parseString("[1, 2, 3]"), [1, 2, 3]);
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
        });

        assert.deepStrictEqual(t.getDefault(), { name: "Alice", age: 30 });
    }

    objectAllChildrenOptionalWithDefaults()
    {
        const t = schema({
            x: number(10),
            y: number(20),
        });

        assert.deepStrictEqual(t.getDefault(), { x: 10, y: 20 });
        // All children are optional (because they have defaults), so the object itself is optional
        assert.strictEqual(t.isOptional, true);
    }

    objectNoChildrenWithDefault()
    {
        const t = schema({
            a: string(),
            b: number(),
        });

        assert.strictEqual(t.getDefault(), undefined);
    }

    objectSingleChildWithDefault()
    {
        const t = schema({
            label: string("fallback"),
            value: number(),
        });

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
        });

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
        });

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
        });

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
        });

        assert.deepStrictEqual(t.getDefault(), { level1: { level2: { level3: { default: 123 } } } });
    }

    // --------------------------------------------------
    // Collection defaults
    // --------------------------------------------------

    arrayWithDefault()
    {
        const t = array([1, 2, 3]);

        assert.deepStrictEqual(t.getDefault(), [1, 2, 3]);
        assert.strictEqual(t.isOptional, true);
    }

    recordWithDefault()
    {
        const t = record({ key: "value" });
        assert.deepStrictEqual(t.getDefault(), { key: "value" });
        assert.strictEqual(t.isOptional, true);
    }

    arrayOfHasNoDefault()
    {
        const t = arrayOf(number);

        assert.strictEqual(t.getDefault(), undefined);
        assert.strictEqual(t.isOptional, false);
    }

    recordOfHasNoDefault()
    {
        const t = recordOf(string);

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
        const t = array([1, 2, 3]);
        const clone = t.getDefault();
        assert.deepStrictEqual(clone, [1, 2, 3]);
        assert.notStrictEqual(clone, (t as any).default);
        clone.push(4);
        assert.deepStrictEqual((t as any).default, [1, 2, 3]);
    }

    arrayDisabledCloneReturnsReference()
    {
        const t = array([1, 2, 3], false);
        const result = t.getDefault();
        assert.deepStrictEqual(result, [1, 2, 3]);
        assert.strictEqual(result, (t as any).default);
        result.push(4);
        assert.deepStrictEqual((t as any).default, [1, 2, 3, 4]);
    }

    recordDefaultReturnsDeepClone()
    {
        const t = record({ key: "value" });
        const clone = t.getDefault();
        assert.deepStrictEqual(clone, { key: "value" });
        assert.notStrictEqual(clone, (t as any).default);
        clone.key = "changed";
        assert.deepStrictEqual((t as any).default, { key: "value" });
    }

    recordDisabledCloneReturnsReference()
    {
        const t = record({ key: "value" }, false);
        const result = t.getDefault();
        assert.deepStrictEqual(result, { key: "value" });
        assert.strictEqual(result, (t as any).default);
        result.key = "changed";
        assert.deepStrictEqual((t as any).default, { key: "changed" });
    }

    withDefaultCloneWhenAssignedTrueClonesDefault()
    {
        const defaults = [1, 2, 3];
        const t = arrayOf(number).withDefault(defaults, true);
        const clone = t.getDefault();
        assert.notStrictEqual(clone, defaults);
    }

    withDefaultCloneWhenAssignedFalseSharesDefault()
    {
        const defaults = [1, 2, 3];
        const t = arrayOf(number).withDefault(defaults, false);
        const result = t.getDefault();
        assert.strictEqual(result, defaults);
    }

    objectWithoutExplicitDefaultReturnsClone()
    {
        const t = schema({
            items: array([1, 2, 3]),
            label: string("test"),
        });
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
        });
        const result = t.getDefault()!;
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
        });

        const clone = t.getDefault()!;
        assert.strictEqual(clone.outer!.shared, sharedArray);
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
        }).withDefault(defaultObj);

        const defaults = t.getDefault()!;

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
        }).withDefault(defaultObj, false);

        const defaults = t.getDefault()!;

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
        });

        const defaults = t.getDefault()!;

        assert.strictEqual(defaults.top!.inner, innerDefault);
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
        });

        const defaults = t.getDefault()!;
        assert.strictEqual(defaults.top!.inner.data, shared);
    }

    // --------------------------------------------------
    // undefined default
    // --------------------------------------------------

    getDefaultsCloneReturnsUndefinedWhenNoDefault()
    {
        const t = string();
        assert.strictEqual(t.getDefault(), undefined);
    }
}
