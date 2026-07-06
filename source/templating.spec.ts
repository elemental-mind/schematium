import * as assert from "node:assert";
import type { ParseResult, ParseSuccessResult, TemplateObject, ValidationAPI, ValidationSettings, ValidationSuccessResult, ValidationTolerances, ValueType } from "./templating.ts";
import { generateTemplatingAPI, RejectionResult, ValidationIssue, ValidationResult } from "./templating.ts";
import { Debug } from "unitium";

function assertParseSuccess<T>(result: ParseResult<T>, expectedValue: T): void
{
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual((result as ParseSuccessResult<T>).value, expectedValue);
}

export interface InjectionSchemaAPI
{
    isOptional: boolean;
    check(value: unknown, settings?: ValidationTolerances): value is ValueType<this>;
    validate(value: unknown, settings?: ValidationSettings): ValidationResult;
    parseString(value: string, settings?: ValidationSettings): ParseResult<ValueType<this>>;
    getDefault(): Partial<ValueType<this>> | undefined;
    schemaAlignedAssign(base: ValueType<this>, ...overrides: any[]): ValueType<this>;
}

const { schema, string, number, boolean, object, valueOf, oneOf, record, recordOf, array, arrayOf } = generateTemplatingAPI<InjectionSchemaAPI>();

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

// ============================================================
// Thorough validation — validate() with mode: "thorough"
// ============================================================

export class ThoroughValidationTests
{
    validateReturnsSuccessResultForValidValue()
    {
        const t = schema({ name: string(), age: number() });
        const result = t.validate({ name: "Alice", age: 30 }, { mode: "thorough" });

        assert.strictEqual(result.success, true);
    }

    validateReturnsRejectionResultForInvalidValue()
    {
        const t = schema({ name: string(), age: number() });
        const result = t.validate({ name: 42, age: "not-a-number" }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        assert.strictEqual(result instanceof RejectionResult, true, "expected result to be a RejectionResult");
        assert.strictEqual((result as RejectionResult).issues.length, 2, "expected 2 issues for two invalid fields");
    }

    thoroughModeCollectsAllIssuesNotJustFirst()
    {
        const t = schema({
            a: string(),
            b: number(),
            c: boolean(),
        });

        const result = t.validate({ a: 123, b: "wrong", c: "also-wrong" }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        // At least 3 type mismatches (a, b, c)
        assert.strictEqual(issues.length, 3, `Expected 3 issues but got ${issues.length}`);
    }

    fastModeStopsAtFirstIssue()
    {
        const t = schema({
            a: string(),
            b: number(),
            c: boolean(),
        });

        const result = t.validate({ a: 123, b: "wrong", c: "also-wrong" }, { mode: "fastNoIssueReport" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        // Fast mode produces an empty issues array (no issue reporting)
        assert.strictEqual(issues.length, 0);
    }

    thoroughModeReportsMissingRequiredMembers()
    {
        const t = schema({
            required: string(),
            optional: string("default"),
        });

        const result = t.validate({}, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.some(i => i.kind === "MissingMember"), true, "expected at least one MissingMember issue");
    }

    thoroughModeReportsUnknownMembers()
    {
        const t = schema({ known: string() });

        const result = t.validate({ known: "ok", unknown: "extra" }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.some(i => i.kind === "UnknownMember"), true, "expected at least one UnknownMember issue");
    }

    thoroughModeReportsTypeMismatch()
    {
        const t = schema({ value: number() });

        const result = t.validate({ value: "not-a-number" }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.some(i => i.kind === "TypeMismatch"), true, "expected at least one TypeMismatch issue");
    }

    thoroughModeReportsUndefinedValue()
    {
        const t = schema({ required: string() });

        const result = t.validate({ required: undefined }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.some(i => i.kind === "UndefinedValue"), true, "expected at least one UndefinedValue issue");
    }

    validateDefaultsToFastMode()
    {
        const t = schema({ a: string(), b: number() });

        // Without mode specified, defaults to fastNoIssueReport
        const result = t.validate({ a: 123, b: "wrong" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.length, 0);
    }
}

// ============================================================
// Validation issue structure
// ============================================================

export class ValidationIssueTests
{
    issueHasKindDerivedFromClassName()
    {
        const t = schema({ value: number() });
        const result = t.validate({ value: "wrong" }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }
}

// ============================================================
// Path tracing in thorough mode
// ============================================================

export class PathTracingTests
{
    nestedObjectReportsPath()
    {
        const t = schema({
            nested: {
                value: number(),
            },
        });

        const result = t.validate({ nested: { value: "wrong" } }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "TypeMismatch");
        assert.notStrictEqual(issue, undefined, "expected a TypeMismatch issue");
        assert.strictEqual(issue!.path, "nested.value");
    }

    deeplyNestedObjectReportsFullPath()
    {
        const t = schema({
            level1: {
                level2: {
                    level3: {
                        value: string(),
                    },
                },
            },
        });

        const result = t.validate({ level1: { level2: { level3: { value: 42 } } } }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "TypeMismatch");
        assert.notStrictEqual(issue, undefined, "expected a TypeMismatch issue for deeply nested value");
        assert.strictEqual(issue!.path, "level1.level2.level3.value");
    }

    missingMemberReportsPath()
    {
        const t = schema({
            nested: {
                required: number(),
            },
        });

        const result = t.validate({ nested: {} }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "MissingMember");
        assert.notStrictEqual(issue, undefined, "expected a MissingMember issue");
        assert.strictEqual(issue!.path, "nested.required");
    }

    arrayEntryReportsPath()
    {
        const t = schema({
            items: arrayOf(number),
        });

        const result = t.validate({ items: [1, "wrong", 3] }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "TypeMismatch");
        assert.notStrictEqual(issue, undefined, "expected a TypeMismatch issue for array entry");
        assert.strictEqual(issue!.path, "items.1");
    }

    recordEntryReportsPath()
    {
        const t = schema({
            data: recordOf(number),
        });

        const result = t.validate({ data: { a: 1, b: "wrong" } }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "TypeMismatch");
        assert.notStrictEqual(issue, undefined, "expected a TypeMismatch issue for record entry");
        assert.strictEqual(issue!.path, "data.b");
    }

    multipleIssuesCollectAllPaths()
    {
        const t = schema({
            nested: {
                a: string(),
                b: number(),
            },
        });

        const result = t.validate({ nested: { a: 42, b: "wrong" } }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.issues.length >= 2, true, "expected at least 2 issues for nested type mismatches");
        const paths = result.issues.map(i => i.path).filter(Boolean);
        assert.strictEqual(paths.includes("nested.a"), true, "expected path 'nested.a' in issues");
        assert.strictEqual(paths.includes("nested.b"), true, "expected path 'nested.b' in issues");
    }
}

// ============================================================
// oneOf — literal template
// ============================================================

export class OneOfDefinitionTests
{
    acceptsMatchingStringLiterals()
    {
        const t = oneOf("open", "closed", "pending");

        assert.strictEqual(t.check("open"), true);
        assert.strictEqual(t.check("closed"), true);
        assert.strictEqual(t.check("pending"), true);
    }

    rejectsNonMatchingStringLiteral()
    {
        const t = oneOf("open", "closed");

        assert.strictEqual(t.check("invalid"), false);
        assert.strictEqual(t.check(""), false);
    }

    acceptsMatchingNumberLiterals()
    {
        const t = oneOf(1, 2, 3);

        assert.strictEqual(t.check(1), true);
        assert.strictEqual(t.check(2), true);
        assert.strictEqual(t.check(3), true);
    }

    rejectsNonMatchingNumberLiteral()
    {
        const t = oneOf(1, 2, 3);

        assert.strictEqual(t.check(4), false);
        assert.strictEqual(t.check(0), false);
    }

    rejectsWrongType()
    {
        const t = oneOf("a", "b");

        assert.strictEqual(t.check(42), false);
        assert.strictEqual(t.check(true), false);
        assert.strictEqual(t.check(null), false);
        assert.strictEqual(t.check(undefined), false);
    }

    parsesMatchingStringLiteral()
    {
        const t = oneOf("yes", "no");

        assertParseSuccess(t.parseString("yes"), "yes");
        assertParseSuccess(t.parseString("no"), "no");
    }

    parsesMatchingNumberLiteral()
    {
        const t = oneOf(10, 20, 30);

        assertParseSuccess(t.parseString("10"), 10);
        assertParseSuccess(t.parseString("20"), 20);
    }

    rejectsParseOfNonMatchingValue()
    {
        const t = oneOf("yes", "no");

        assert.strictEqual(t.parseString("maybe").success, false);
    }

    rejectsParseOfNonMatchingNumber()
    {
        const t = oneOf(1, 2, 3);

        assert.strictEqual(t.parseString("4").success, false);
    }

    rejectsParseOfInvalidNumberString()
    {
        const t = oneOf(1, 2, 3);

        assert.strictEqual(t.parseString("abc").success, false);
    }

    thoroughModeReportsLiteralMismatch()
    {
        const t = oneOf("a", "b");

        const result = t.validate("c", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for literal mismatch");
        assert.strictEqual(result.issues[0].kind, "UnknownValue");
    }

    mixedStringAndNumberLiterals()
    {
        // oneOf only accepts string | number, so mixing is allowed
        const t = oneOf("yes", 1);

        assert.strictEqual(t.check("yes"), true);
        assert.strictEqual(t.check(1), true);
        assert.strictEqual(t.check("1"), false);
        assert.strictEqual(t.check("no"), false);
    }
}

// ============================================================
// Validator-based custom validators
// ============================================================

export class ValidatorTests
{
    acceptsBooleanValidator()
    {
        const t = number().accepts((v: number) => v > 0);

        assert.strictEqual(t.check(5), true);
        assert.strictEqual(t.check(-1), false);
    }

    acceptsValidator()
    {
        const t = number().accepts((v: number, validator: ValidationAPI) =>
        {
            if (v <= 0)
                validator.rejectWith(ValidationIssue, "Value must be positive");
        });

        assert.strictEqual(t.check(5), true);
        assert.strictEqual(t.check(-1), false);
    }

    validatorReportsCustomMessage()
    {
        const t = number().accepts((v: number, validator: ValidationAPI) =>
        {
            if (v <= 0)
                validator.rejectWith(ValidationIssue, "Value must be positive");
        });

        const result = t.validate(-1, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for custom validator rejection");
        assert.strictEqual(result.issues[0].message, "Value must be positive");
    }

    booleanValidatorReportsDefaultMessage()
    {
        const t = number().accepts((v: number) => v > 0);

        const result = t.validate(-1, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for boolean validator rejection");
        assert.strictEqual(result.issues[0].message!.includes("Custom validation failed"), true, "expected default custom validation failure message");
    }

    acceptsEntriesValidator()
    {
        const t = arrayOf(number).acceptsEntries((key: string | number, value: number, validator: ValidationAPI) =>
        {
            if (value < 0)
                validator.rejectWith(ValidationIssue, `Entry at ${key} must be non-negative`);
        });

        assert.strictEqual(t.check([1, 2, 3]), true);
        assert.strictEqual(t.check([1, -1, 3]), false);
    }

    acceptsEntriesReportsCustomMessage()
    {
        const t = arrayOf(number).acceptsEntries((key: string | number, value: number, validator: ValidationAPI) =>
        {
            if (value < 0)
                validator.rejectWith(ValidationIssue, `Entry at ${key} must be non-negative`);
        });

        const result = t.validate([1, -1], { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for acceptsEntries rejection");
        assert.strictEqual(result.issues[0].message!.includes("must be non-negative"), true, "expected non-negative validation message");
    }

    booleanAcceptsEntriesRejectsOnFalse()
    {
        const t = arrayOf(number).acceptsEntries((key: string | number, value: number) => value > 0);

        assert.strictEqual(t.check([1, 2, 3]), true);
        assert.strictEqual(t.check([-1]), false);
    }

    acceptsEntriesOnRecord()
    {
        const t = recordOf(string).acceptsEntries((key: string | number, value: string, validator: ValidationAPI) =>
        {
            if (value.length === 0)
                validator.rejectWith(ValidationIssue, `Entry '${key}' must not be empty`);
        });

        assert.strictEqual(t.check({ a: "hello", b: "world" }), true);
        assert.strictEqual(t.check({ a: "hello", b: "" }), false);
    }

    validatorSkipsWhenTypeMismatch()
    {
        // If type validation fails, the custom validator should not be called
        let validatorCalled = false;
        const t = number().accepts((v: number, validator: ValidationAPI) =>
        {
            validatorCalled = true;
        });

        t.check("not-a-number");
        assert.strictEqual(validatorCalled, false);
    }
}

// ============================================================
// Parse result structure
// ============================================================

export class ParseResultIssueTests
{
    parseStringSuccessReturnsParseSuccessResult()
    {
        const t = string();
        const result = t.parseString("hello");

        assert.strictEqual(result.success, true);
        assert.strictEqual("value" in (result as ParseSuccessResult<string>), true, "expected 'value' property in success result");
        assert.strictEqual((result as ParseSuccessResult<string>).value, "hello");
    }

    parseStringFailureReturnsRejectionResult()
    {
        const t = number();
        const result = t.parseString("not-a-number");

        assert.strictEqual(result.success, false);
        assert.strictEqual(result instanceof RejectionResult, true, "expected parse failure to return RejectionResult");
        assert.strictEqual("issues" in result, true, "expected 'issues' property in rejection result");
    }

    parseStringFailureHasIssues()
    {
        const t = number();
        const result = t.parseString("not-a-number", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for invalid number parse");
        assert.strictEqual(result.issues[0].kind, "ParseError");
    }

    parseStringFailureReportsMessage()
    {
        const t = boolean();
        const result = t.parseString("yes", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for invalid boolean parse");
        assert.strictEqual(result.issues[0].message!.includes("yes"), true, "expected parse error message to include 'yes'");
    }

    parseStringObjectInvalidJsonReportsParseError()
    {
        const t = schema({ name: string() });
        const result = t.parseString("{invalid json", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid object member");
    }

    parseStringObjectWithInvalidMemberReportsTypeMismatch()
    {
        const t = schema({ count: number() });
        const result = t.parseString('{"count":"not-a-number"}', { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid object JSON parse");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
        assert.strictEqual(result.issues[0].path, "count");
    }

    parseStringThoroughModeCollectsAllIssues()
    {
        const t = schema({ a: number(), b: boolean() });
        const result = t.parseString('{"a":"wrong","b":"also-wrong"}', { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length >= 2, "expected at least 2 issues for invalid JSON fields");
    }

    parseStringArrayInvalidJsonReportsParseError()
    {
        const t = arrayOf(number);
        const result = t.parseString("[invalid", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid array JSON");
        assert.strictEqual(result.issues[0].kind, "ParseError");
    }

    parseStringArrayWithInvalidElementReportsTypeMismatch()
    {
        const t = arrayOf(number);
        // JSON parse succeeds but validation of elements fails
        const result = t.parseString('["not-a-number"]', { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid array element");
    }

    parseStringRecordInvalidJsonReportsParseError()
    {
        const t = recordOf(string);
        const result = t.parseString("{bad", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid record JSON");
        assert.strictEqual(result.issues[0].kind, "ParseError");
    }
}

// ============================================================
// Object factory
// ============================================================

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

// ============================================================
// Validate on primitive types with thorough mode
// ============================================================

export class PrimitiveThoroughValidationTests
{
    stringThoroughReportsTypeMismatch()
    {
        const t = string();
        const result = t.validate(42, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one string type mismatch issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    numberThoroughReportsTypeMismatch()
    {
        const t = number();
        const result = t.validate("not-a-number", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one number type mismatch issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    numberThoroughReportsNonFinite()
    {
        const t = number();
        const result = t.validate(NaN, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one non-finite number issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    numberThoroughReportsInfinity()
    {
        const t = number();
        const result = t.validate(Infinity, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one infinity issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    booleanThoroughReportsTypeMismatch()
    {
        const t = boolean();
        const result = t.validate("not-a-boolean", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one boolean type mismatch issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    variadicThoroughReportsUnknownValue()
    {
        const t = valueOf(number, string);
        const result = t.validate(true, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one unknown value issue");
        assert.strictEqual(result.issues[0].kind, "UnknownValue");
    }

    requiredPrimitiveReportsUndefinedValue()
    {
        const t = number();
        const result = t.validate(undefined, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one undefined value issue");
        assert.strictEqual(result.issues[0].kind, "UndefinedValue");
    }

    optionalPrimitiveAcceptsUndefined()
    {
        const t = number(42);
        const result = t.validate(undefined, { mode: "thorough" });

        assert.strictEqual(result.success, true);
    }
}

// ============================================================
// Thorough validation on collections
// ============================================================

export class CollectionThoroughValidationTests
{
    arrayThoroughReportsAllInvalidEntries()
    {
        const t = arrayOf(number);
        const result = t.validate(["a", "b", 3], { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length >= 2, "expected at least 2 invalid array entry issues");
    }

    recordThoroughReportsAllInvalidEntries()
    {
        const t = recordOf(number);
        const result = t.validate({ a: "wrong", b: "also-wrong", c: 3 }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length >= 2, "expected at least 2 invalid record entry issues");
    }

    recordThoroughRejectsNonObject()
    {
        const t = recordOf(string);
        const result = t.validate("not-an-object", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one type mismatch issue for non-object");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    arrayThoroughRejectsNonArray()
    {
        const t = arrayOf(number);
        const result = t.validate({ not: "array" }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one type mismatch issue for non-array");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }
}

// ============================================================
// Schema-aligned assign
// ============================================================

export class SchemaAlignedAssignTests
{
    // --------------------------------------------------
    // Simple object merging
    // --------------------------------------------------

    mergesPartialOverrideIntoBaseObject()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.schemaAlignedAssign(
            { host: "localhost", port: 8080 },
            { port: 3000 }
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 3000 });
    }

    overrideReplacesAllKeysWhenAllProvided()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.schemaAlignedAssign(
            { host: "localhost", port: 8080 },
            { host: "example.com", port: 3000 }
        );

        assert.deepStrictEqual(result, { host: "example.com", port: 3000 });
    }

    dropsOverrideKeysNotDefinedInSchema()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.schemaAlignedAssign(
            { host: "localhost", port: 8080 },
            { host: "example.com", unknown: "should be dropped" } as any
        );

        assert.deepStrictEqual(result, { host: "example.com", port: 8080 });
    }

    emptyOverrideReturnsBaseUnchanged()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.schemaAlignedAssign(
            { host: "localhost", port: 8080 },
            {}
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 8080 });
    }

    // --------------------------------------------------
    // Variadic with two object shapes — variant switching
    // --------------------------------------------------

    variadicReplacesEntirelyWhenOverrideTargetsDifferentShape()
    {
        const t = valueOf(
            { type: string(), value: number() },
            { type: string(), label: string(), enabled: boolean() }
        );

        const result = t.schemaAlignedAssign(
            { type: "x", value: 123 },
            { type: "y", label: "something", enabled: false }
        );

        // Override targets a different shape → full replace, no key leakage from base
        assert.deepStrictEqual(result, { type: "y", label: "something", enabled: false });
    }

    variadicMergesWhenOverrideTargetsSameShape()
    {
        const t = valueOf(
            { type: string(), value: number() },
            { type: string(), label: string(), enabled: boolean() }
        );

        const result = t.schemaAlignedAssign(
            { type: "x", value: 123 },
            { type: "x", value: 456 }
        );

        // Same shape → merge
        assert.deepStrictEqual(result, { type: "x", value: 456 });
    }

    variadicPartialOverrideSameShapePreservesOtherKeys()
    {
        const t = valueOf(
            { type: string(), value: number(), extra: string("default") },
            { type: string(), label: string(), enabled: boolean() }
        );

        const result = t.schemaAlignedAssign(
            { type: "x", value: 123, extra: "keep-me" },
            { value: 456 }
        );

        // Same shape, partial override → merge preserving non-overridden keys from base
        assert.deepStrictEqual(result, { type: "x", value: 456, extra: "keep-me" });
    }

    variadicReplaceDropsStaleKeysFromPreviousShape()
    {
        const t = valueOf(
            { type: string(), value: number() },
            { type: string(), label: string(), enabled: boolean() }
        );

        const result = t.schemaAlignedAssign(
            { type: "x", value: 123 },
            { type: "y", label: "new", enabled: true }
        );

        // Full replace to Shape B — `value` from Shape A must not leak through
        assert.deepStrictEqual(result, { type: "y", label: "new", enabled: true });
    }

    variadicOverrideWithExtraneousKeysRelativeToTargetShapeDropsThem()
    {
        const t = valueOf(
            { type: string(), value: number() },
            { type: string(), label: string(), enabled: boolean() }
        );

        // Override targets Shape B but also carries `value` (a Shape A key)
        const result = t.schemaAlignedAssign(
            { type: "x", value: 123 },
            { type: "y", label: "new", enabled: true, value: 999 }
        );

        // `value` should be stripped — it's not in Shape B's schema
        assert.deepStrictEqual(result, { type: "y", label: "new", enabled: true });
    }

    // --------------------------------------------------
    // Nested object merging
    // --------------------------------------------------

    nestedObjectMergesRecursively()
    {
        const t = schema({
            name: string(),
            settings: {
                theme: string(),
                volume: number(),
            },
        });

        const result = t.schemaAlignedAssign(
            { name: "app", settings: { theme: "dark", volume: 80 } },
            { settings: { volume: 50 } }
        );

        assert.deepStrictEqual(result, { name: "app", settings: { theme: "dark", volume: 50 } });
    }

    nestedObjectFullOverrideReplacesSubtree()
    {
        const t = schema({
            name: string(),
            settings: {
                theme: string(),
                volume: number(),
            },
        });

        const result = t.schemaAlignedAssign(
            { name: "app", settings: { theme: "dark", volume: 80 } },
            { settings: { theme: "light", volume: 20 } }
        );

        assert.deepStrictEqual(result, { name: "app", settings: { theme: "light", volume: 20 } });
    }

    nestedObjectDropsUnknownKeysInSubtree()
    {
        const t = schema({
            name: string(),
            settings: {
                theme: string(),
                volume: number(),
            },
        });

        const result = t.schemaAlignedAssign(
            { name: "app", settings: { theme: "dark", volume: 80 } },
            { settings: { theme: "light", unknown: "drop-me" } }
        );

        assert.deepStrictEqual(result, { name: "app", settings: { theme: "light", volume: 80 } });
    }

    // --------------------------------------------------
    // Nested variadic objects
    // --------------------------------------------------

    nestedVariadicFieldSwitchesShapeWithinParentObject()
    {
        const t = schema({
            name: string(),
            payload: valueOf(
                { kind: string(), value: number() },
                { kind: string(), label: string(), enabled: boolean() }
            ),
        });

        const result = t.schemaAlignedAssign(
            { name: "test", payload: { kind: "a", value: 10 } },
            { payload: { kind: "b", label: "override", enabled: true } }
        );

        // payload switches variant → full replace of the nested variadic, parent key preserved
        assert.deepStrictEqual(result, { name: "test", payload: { kind: "b", label: "override", enabled: true } });
    }

    nestedVariadicFieldMergesWithinSameShape()
    {
        const t = schema({
            name: string(),
            payload: valueOf(
                { kind: string(), value: number(), extra: string("default") },
                { kind: string(), label: string(), enabled: boolean() }
            ),
        });

        const result = t.schemaAlignedAssign(
            { name: "test", payload: { kind: "a", value: 10, extra: "keep" } },
            { payload: { value: 99 } }
        );

        // payload stays in same variant → merge preserving base keys
        assert.deepStrictEqual(result, { name: "test", payload: { kind: "a", value: 99, extra: "keep" } });
    }

    deeplyNestedVariadicSwitchesAtLeafLevel()
    {
        const t = schema({
            app: string(),
            config: {
                target: valueOf(
                    { mode: string(), retries: number() },
                    { mode: string(), fallback: string(), timeout: number() }
                ),
            },
        });

        const result = t.schemaAlignedAssign(
            { app: "svc", config: { target: { mode: "direct", retries: 3 } } },
            { config: { target: { mode: "proxy", fallback: "backup", timeout: 5000 } } }
        );

        // Deep nested variadic switches → leaf replaced entirely, parent keys preserved
        assert.deepStrictEqual(result, { app: "svc", config: { target: { mode: "proxy", fallback: "backup", timeout: 5000 } } });
    }

    // --------------------------------------------------
    // Primitive values (non-object)
    // --------------------------------------------------

    primitiveStringOverrideReplacesValue()
    {
        const t = string();
        const result = t.schemaAlignedAssign("hello", "world");

        assert.strictEqual(result, "world");
    }

    primitiveNumberOverrideReplacesValue()
    {
        const t = number();
        const result = t.schemaAlignedAssign(42, 100);

        assert.strictEqual(result, 100);
    }

    variadicPrimitiveOverrideReplacesValue()
    {
        const t = valueOf(number, string);
        const result = t.schemaAlignedAssign(42, "hello");

        assert.strictEqual(result, "hello");
    }

    // --------------------------------------------------
    // Collections (arrays and records) — replace entirely
    // --------------------------------------------------

    arrayOverrideReplacesEntirely()
    {
        const t = arrayOf(number);
        const result = t.schemaAlignedAssign([1, 2, 3], [4, 5]);

        assert.deepStrictEqual(result, [4, 5]);
    }

    recordOverrideReplacesEntirely()
    {
        const t = recordOf(string);
        const result = t.schemaAlignedAssign({ a: "x" }, { b: "y" });

        assert.deepStrictEqual(result, { b: "y" });
    }

    // --------------------------------------------------
    // Multiple overrides — applied left to right
    // --------------------------------------------------

    multipleOverridesAppliedLeftToRight()
    {
        const t = schema({
            host: string(),
            port: number(),
            debug: boolean(),
        });

        const result = t.schemaAlignedAssign(
            { host: "localhost", port: 8080, debug: false },
            { port: 3000 },
            { debug: true }
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 3000, debug: true });
    }

    multipleOverridesLaterOneWinsOnConflict()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.schemaAlignedAssign(
            { host: "localhost", port: 8080 },
            { port: 3000 },
            { port: 9090 }
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 9090 });
    }

    // --------------------------------------------------
    // Edge cases — undefined / null overrides
    // --------------------------------------------------

    undefinedOverrideIsSkipped()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.schemaAlignedAssign(
            { host: "localhost", port: 8080 },
            undefined as any
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 8080 });
    }

    nullOverrideIsSkipped()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.schemaAlignedAssign(
            { host: "localhost", port: 8080 },
            null as any
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 8080 });
    }

    // --------------------------------------------------
    // Defaults — base populated from schema defaults when not provided
    // --------------------------------------------------

    usesSchemaDefaultsWhenBaseHasMissingOptionalKeys()
    {
        const t = schema({
            host: string(),
            port: number(8080),
            debug: boolean(false),
        });

        // Base only provides `host`; port and debug should use defaults as base values
        const result = t.schemaAlignedAssign(
            { host: "localhost" } as any,
            { debug: true }
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 8080, debug: true });
    }
}
