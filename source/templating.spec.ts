import { Debug } from "unitium";
import * as assert from "node:assert";
import { array, arrayOf, boolean, list, listOf, number, object, schema, string, type TemplateObject, valueOf, ValueTemplateAPI, ValueType } from "./templating.ts";


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
        const t = number(123).accepts(v => v > 0);
        const template = withValidate(t);
        assert.strictEqual(template.validate(5), true);
        assert.strictEqual(template.validate(-1), false);
    }

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

    // ============================================================
    // Variadic parseString — CLI args arrive as strings, so we need
    // to coerce numbers, booleans etc. from their string form.
    // ============================================================

    numberTakesPriorityOverStringWhenParsing()
    {
        // number (priority 0) is tried before string (priority 2) → "42" → 42
        const t = valueOf(number, string);
        assert.strictEqual(withValidate(t).parseString("42"), 42);
    }

    stringIsFallbackWhenNumberCannotParse()
    {
        // number fails on "hello", string catches it
        const t = valueOf(number, string);
        assert.strictEqual(withValidate(t).parseString("hello"), "hello");
    }

    userPassedOrderDoesNotAffectParsePriority()
    {
        // Even when string is listed first, number (priority 0) is tried before
        // string (priority 2), so "42" parses as number 42.
        const t = valueOf(string, number);
        assert.strictEqual(withValidate(t).parseString("42"), 42);
    }

    parsesBooleanTrueFromString()
    {
        // number (priority 0) tried first, fails on "true"/"1"; then boolean (priority 1) catches them
        const t = valueOf(number, boolean);
        assert.strictEqual(withValidate(t).parseString("true"), true);
        assert.strictEqual(withValidate(t).parseString("1"), 1);
    }

    parsesBooleanFalseFromString()
    {
        const t = valueOf(boolean);
        assert.strictEqual(withValidate(t).parseString("false"), false);
        assert.strictEqual(withValidate(t).parseString("0"), false);
    }

    singleNumberTypeThrowsOnInvalidString()
    {
        const t = valueOf(number);
        assert.throws(() => withValidate(t).parseString("not-a-number"));
    }

    singleStringTypeReturnsIdentity()
    {
        const t = valueOf(string);
        assert.strictEqual(withValidate(t).parseString("anything"), "anything");
    }

    emptyStringParsesAsStringWhenNumberIsPermitted()
    {
        // Number("") === 0, which is finite, so number matches
        const t = valueOf(number, string);
        assert.strictEqual(withValidate(t).parseString(""), "");
        assert.strictEqual(withValidate(t).parseString(" "), " ");
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
        const t = list({ value: "text", anotherValue: "also text" });
        const template = withValidate(t);
        assert.strictEqual(template.validate({ a: "foo", b: "bar" }), true);
        assert.strictEqual(template.validate({ a: 1 } as any), false);
        assert.strictEqual(template.validate({ a: true } as any), false);
    }

    passedSubExampleObjectsAreParsedAsLists()
    {
        const t = list({ value: { value: "text", anotherValue: "also text" } });
        const template = withValidate(t);
        assert.strictEqual(template.validate({ value: { value: "foo", anotherValue: "bar" } }), true);
        assert.strictEqual(template.validate({ value: { value: "foo", newName: "bar" } }), true);
        assert.strictEqual(template.validate({ value: { value: 123 } }), false);
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

    validatesStringOrNumberList()
    {
        const t = listOf(string, number);
        const template = withValidate(t);
        assert.strictEqual(template.validate({ a: "text", b: 42 }), true);
        assert.strictEqual(template.validate({ a: true }), false);
        assert.strictEqual(template.validate({ a: {} }), false);
    }

    emptyListIsValid()
    {
        const t = listOf(string, number);
        const template = withValidate(t);
        assert.strictEqual(template.validate({}), true);
    }

    exampleListWithStringOrNumber()
    {
        const t = list({ a: "hello", b: 42 });
        const template = withValidate(t);
        assert.strictEqual(template.validate({ a: "world", b: 99 }), true);
        assert.strictEqual(template.validate({ a: "only" }), true);
        assert.strictEqual(template.validate({ a: true }), false);
        assert.strictEqual(template.validate({ a: 1, b: "yep" }), true);
        assert.strictEqual(template.validate({}), true);
    }

    exampleListAllowsAnyKeyName()
    {
        const t = list({ value: "text" });
        const template = withValidate(t);
        assert.strictEqual(template.validate({ value: "foo" }), true);
        assert.strictEqual(template.validate({ anyKey: "bar" }), true);
        assert.strictEqual(template.validate({ "": "empty" }), true);
        assert.strictEqual(template.validate({ key: "x", anotherKey: "y" }), true);
    }

    parsesListFromJson()
    {
        const t = listOf(string);
        const result = withValidate(t).parseString('{"a":"x"}');
        assert.deepStrictEqual(result, { a: "x" });
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
        const t = arrayOf(number).withDefault([1, 2, 3]) as any;
        assert.deepStrictEqual(t.default, [1, 2, 3]);
        assert.strictEqual(t.isOptional, true);
    }

    parsesArrayFromJson()
    {
        const t = arrayOf(number);
        assert.deepStrictEqual(withValidate(t).parseString("[1, 2, 3]"), [1, 2, 3]);
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

    listWithDefault()
    {
        const t = list({ key: "value" }) as any;
        ;
        assert.deepStrictEqual(t.getDefault(), { key: "value" });
        assert.strictEqual(t.isOptional, true);
    }
    arrayOfHasNoDefault()
    {
        const t = arrayOf(number) as any;

        assert.strictEqual(t.getDefault(), undefined);
        assert.strictEqual(t.isOptional, false);
    }

    listOfHasNoDefault()
    {
        const t = listOf(string) as any;

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

    listDefaultReturnsDeepClone()
    {
        const t = list({ key: "value" }) as any;
        const clone = t.getDefault();
        assert.deepStrictEqual(clone, { key: "value" });
        assert.notStrictEqual(clone, t.default);
        clone.key = "changed";
        assert.deepStrictEqual(t.default, { key: "value" });
    }

    listDisabledCloneReturnsReference()
    {
        const t = list({ key: "value" }, false) as any;
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
