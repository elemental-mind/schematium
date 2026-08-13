import * as assert from "node:assert";
import
{
    array,
    arrayOf,
    boolean,
    number,
    object,
    record,
    recordOf,
    RejectionResult,
    schema,
    string,
    ValidationIssue,
    valueOf,
    type ValidationAPI,
} from "../../tests/util/spec-support.ts";

export class DefaultValueTests
{
    objectDerivesDefaultFromChildren()
    {
        const t = schema({
            name: string("Alice"),
            age: number(30),
            role: string(), // required â€” no default, not marked optional
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
                inner2: number(), // required â€” no default
            },
        });

        // Only inner1 has a default â†’ outer's default is { inner1: "default" }
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
// getDefault â€” clone control via cloneDefaultOnAssignment
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

        const result = t.patchOrOverride(
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

        const result = t.patchOrOverride(
            { host: "localhost", port: 8080 },
            { host: "example.com", port: 3000 }
        );

        assert.deepStrictEqual(result, { host: "example.com", port: 3000 });
    }

    rejectsOverrideKeysNotDefinedInSchema()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        assert.throws(() => t.patchOrOverride(
            { host: "localhost", port: 8080 },
            { host: "example.com", unknown: "not allowed" } as any
        ));
    }

    emptyOverrideReturnsBaseUnchanged()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.patchOrOverride(
            { host: "localhost", port: 8080 },
            {}
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 8080 });
    }

    // --------------------------------------------------
    // Variadic with two object shapes â€” variant switching
    // --------------------------------------------------

    variadicReplacesEntirelyWhenOverrideTargetsDifferentShape()
    {
        const t = valueOf(
            { type: string(), value: number() },
            { type: string(), label: string(), enabled: boolean() }
        );

        const result = t.patchOrOverride(
            { type: "x", value: 123 },
            { type: "y", label: "something", enabled: false }
        );

        // Override targets a different shape â†’ full replace, no key leakage from base
        assert.deepStrictEqual(result, { type: "y", label: "something", enabled: false });
    }

    variadicMergesWhenOverrideTargetsSameShape()
    {
        const t = valueOf(
            { type: string(), value: number() },
            { type: string(), label: string(), enabled: boolean() }
        );

        const result = t.patchOrOverride(
            { type: "x", value: 123 },
            { type: "x", value: 456 }
        );

        // Same shape â†’ merge
        assert.deepStrictEqual(result, { type: "x", value: 456 });
    }

    variadicPartialOverrideSameShapePreservesOtherKeys()
    {
        const t = valueOf(
            { type: string(), value: number(), extra: string("default") },
            { type: string(), label: string(), enabled: boolean() }
        );

        const result = t.patchOrOverride(
            { type: "x", value: 123, extra: "keep-me" },
            { value: 456 }
        );

        // Same shape, partial override â†’ merge preserving non-overridden keys from base
        assert.deepStrictEqual(result, { type: "x", value: 456, extra: "keep-me" });
    }

    variadicReplaceDropsStaleKeysFromPreviousShape()
    {
        const t = valueOf(
            { type: string(), value: number() },
            { type: string(), label: string(), enabled: boolean() }
        );

        const result = t.patchOrOverride(
            { type: "x", value: 123 },
            { type: "y", label: "new", enabled: true }
        );

        // Full replace to Shape B â€” `value` from Shape A must not leak through
        assert.deepStrictEqual(result, { type: "y", label: "new", enabled: true });
    }

    variadicOverrideRejectsExtraneousKeys()
    {
        const t = valueOf(
            { type: string(), value: number() },
            { type: string(), label: string(), enabled: boolean() }
        );

        assert.throws(() => t.patchOrOverride(
            { type: "x", value: 123 },
            { type: "y", label: "new", enabled: true, unknown: 999 }
        ));
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

        const result = t.patchOrOverride(
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

        const result = t.patchOrOverride(
            { name: "app", settings: { theme: "dark", volume: 80 } },
            { settings: { theme: "light", volume: 20 } }
        );

        assert.deepStrictEqual(result, { name: "app", settings: { theme: "light", volume: 20 } });
    }

    nestedObjectRejectsUnknownKeysInSubtree()
    {
        const t = schema({
            name: string(),
            settings: {
                theme: string(),
                volume: number(),
            },
        });

        assert.throws(() => t.patchOrOverride(
            { name: "app", settings: { theme: "dark", volume: 80 } },
            { settings: { theme: "light", unknown: "drop-me" } }
        ));
    }

    rejectsWronglyTypedPrimitiveOverride()
    {
        const t = number();

        assert.throws(() => t.patchOrOverride(42, "not-a-number"));
    }

    rejectsWronglyTypedObjectMemberOverride()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        assert.throws(() => t.patchOrOverride(
            { host: "localhost", port: 8080 },
            { port: "not-a-number" }
        ));
    }

    rejectsWronglyTypedNestedVariadicMemberOverride()
    {
        const t = schema({
            payload: valueOf(
                { kind: string(), value: number() },
                { kind: string(), enabled: boolean() }
            ),
        });

        assert.throws(() => t.patchOrOverride(
            { payload: { kind: "value", value: 10 } },
            { payload: { value: "not-a-number" } }
        ));
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

        const result = t.patchOrOverride(
            { name: "test", payload: { kind: "a", value: 10 } },
            { payload: { kind: "b", label: "override", enabled: true } }
        );

        // payload switches variant â†’ full replace of the nested variadic, parent key preserved
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

        const result = t.patchOrOverride(
            { name: "test", payload: { kind: "a", value: 10, extra: "keep" } },
            { payload: { value: 99 } }
        );

        // payload stays in same variant â†’ merge preserving base keys
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

        const result = t.patchOrOverride(
            { app: "svc", config: { target: { mode: "direct", retries: 3 } } },
            { config: { target: { mode: "proxy", fallback: "backup", timeout: 5000 } } }
        );

        // Deep nested variadic switches â†’ leaf replaced entirely, parent keys preserved
        assert.deepStrictEqual(result, { app: "svc", config: { target: { mode: "proxy", fallback: "backup", timeout: 5000 } } });
    }

    optionalsSwitchInDeepNestedTree()
    {
        const t = schema({
            app: string(),
            config: {
                target: valueOf(
                    { retries: number().optional, timeout: number().optional },
                    { fallback: string().optional, port: number().optional }
                ),
            },
        });

        const result = t.patchOrOverride(
            { app: "svc", config: { target: { retries: 3 } } },
            { config: { target: { fallback: "backup" } } }
        );

        // Deep nested variadic switches â†’ leaf replaced entirely, parent keys preserved
        assert.deepStrictEqual(result, { app: "svc", config: { target: { fallback: "backup" } } });
    }



    // --------------------------------------------------
    // Primitive values (non-object)
    // --------------------------------------------------

    primitiveStringOverrideReplacesValue()
    {
        const t = string();
        const result = t.patchOrOverride("hello", "world");

        assert.strictEqual(result, "world");
    }

    primitiveNumberOverrideReplacesValue()
    {
        const t = number();
        const result = t.patchOrOverride(42, 100);

        assert.strictEqual(result, 100);
    }

    variadicPrimitiveOverrideReplacesValue()
    {
        const t = valueOf(number, string);
        const result = t.patchOrOverride(42, "hello");

        assert.strictEqual(result, "hello");
    }

    // --------------------------------------------------
    // Collections (arrays and records) â€” replace entirely
    // --------------------------------------------------

    arrayOverrideReplacesEntirely()
    {
        const t = arrayOf(number);
        const result = t.patchOrOverride([1, 2, 3], [4, 5]);

        assert.deepStrictEqual(result, [4, 5]);
    }

    recordOverrideReplacesEntirely()
    {
        const t = recordOf(string);
        const result = t.patchOrOverride({ a: "x" }, { b: "y" });

        assert.deepStrictEqual(result, { b: "y" });
    }

    // --------------------------------------------------
    // Edge cases â€” undefined / null overrides
    // --------------------------------------------------

    undefinedOverrideIsSkipped()
    {
        const t = schema({
            host: string(),
            port: number(),
        });

        const result = t.patchOrOverride(
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

        const result = t.patchOrOverride(
            { host: "localhost", port: 8080 },
            null as any
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 8080 });
    }

    // --------------------------------------------------
    // Defaults â€” base populated from schema defaults when not provided
    // --------------------------------------------------

    usesSchemaDefaultsWhenBaseHasMissingOptionalKeys()
    {
        const t = schema({
            host: string(),
            port: number(8080),
            debug: boolean(false),
        });

        // Base only provides `host`; port and debug should use defaults as base values
        const result = t.patchOrOverride(
            { host: "localhost" } as any,
            { debug: true }
        );

        assert.deepStrictEqual(result, { host: "localhost", port: 8080, debug: true });
    }
}
