import * as assert from "node:assert";
import { arrayOf, number, record, recordOf, string, assertParseSuccess } from "../../../tests/util/spec-support.ts";

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
