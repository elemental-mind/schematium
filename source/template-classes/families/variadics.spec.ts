import * as assert from "node:assert";
import { arrayOf, boolean, number, oneOf, recordOf, string, valueOf, ValidationIssue, assertParseSuccess, countJSONParseCalls, withoutDialect, type ValidationContext } from "../../../tests/util/spec-support.ts";

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
    // Variadic parseString CLI args arrive as strings, so we need
    // to coerce numbers, booleans etc. from their string form.
    // ============================================================

    numberTakesPriorityOverStringWhenParsing()
    {
        // number (priority 0) is tried before string (priority 2) â†’ "42" â†’ 42
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
        // number (priority 0) tried first succeeds on "1", fails on "true";
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
// Variadic object shape discernment
// ============================================================

export class VariadicObjectDiscernmentTests
{

    uniquelyKeyedObjectsAreDiscriminated()
    {
        const t = valueOf(
            { username: string(), age: number() },
            { username: string(), permissions: string() },
            { sku: string(), price: number() }
        );

        assert.strictEqual(t.check({ username: "alice", age: 30 }), true, "expected User shape to pass");
        assert.strictEqual(t.check({ username: "bob", permissions: "root" }), true, "expected Admin shape to pass");
        assert.strictEqual(t.check({ sku: "ABC", price: 9.99 }), true, "expected Product shape to pass");
    }

    uniquelyKeyedObjectsParseFromJson()
    {
        const t = valueOf(
            { username: string(), age: number() },
            { username: string(), permissions: string() }
        );

        assertParseSuccess(t.parseString('{"username":"alice","age":30}'), { username: "alice", age: 30 });
        assertParseSuccess(t.parseString('{"username":"bob","permissions":"root"}'), { username: "bob", permissions: "root" });
    }

    sharedKeyObjectsAreDiscriminated()
    {
        const t = valueOf(
            { radius: number() },
            { width: number(), height: number() },
            { width: number() }
        );

        assert.strictEqual(t.check({ radius: 5 }), true, "expected Circle to pass");
        assert.strictEqual(t.check({ width: 10, height: 20 }), true, "expected Rectangle to pass");
        assert.strictEqual(t.check({ width: 10 }), true, "expected Square to pass");
    }

    sharedKeyObjectsRejectAmbiguousInvalidShapes()
    {
        const t = valueOf(
            { radius: number() },
            { width: number(), height: number() },
            { width: number() }
        );

        // Wrong type
        assert.strictEqual(t.check({ radius: "big" }), false, "expected wrong type on Circle to fail");
        assert.strictEqual(t.check({ width: "wide", height: 20 }), false, "expected wrong type on Rectangle to fail");
    }

    sharedKeyObjectsParseFromJson()
    {
        const t = valueOf(
            { radius: number() },
            { width: number(), height: number() },
            { width: number() }
        );

        assertParseSuccess(t.parseString('{"radius":5}'), { radius: 5 });
        assertParseSuccess(t.parseString('{"width":10,"height":20}'), { width: 10, height: 20 });
        assertParseSuccess(t.parseString('{"width":10}'), { width: 10 });
    }

    objectShapesShareOneJSONParse()
    {
        const t = valueOf(
            { radius: number() },
            { width: number(), height: number() },
            { sku: string(), price: number() }
        );

        const calls = countJSONParseCalls(() => assertParseSuccess(t.parseString('{"sku":"A","price":1}'), { sku: "A", price: 1 }));
        assert.strictEqual(calls, 1, "expected all object shapes to share one JSON.parse");
    }

    objectsAndCollectionsShareOneJSONParseAmongOtherAlternatives()
    {
        const t = valueOf({ id: number() }, arrayOf(number), recordOf(string), number, boolean, string, "auto", 1);

        assert.strictEqual(countJSONParseCalls(() => assertParseSuccess(t.parseString('{"id":7}'), { id: 7 })), 1, "expected one JSON.parse for an object");
        assert.strictEqual(countJSONParseCalls(() => assertParseSuccess(t.parseString("[1,2,3]"), [1, 2, 3])), 1, "expected one JSON.parse for an array");
        assert.strictEqual(countJSONParseCalls(() => assertParseSuccess(t.parseString('{"name":"x"}'), { name: "x" })), 1, "expected one JSON.parse for a record");
    }

    typeDifferenceDiscriminatesObjects()
    {
        const t = valueOf(
            { id: number() },
            { id: string() }
        );

        assert.strictEqual(t.check({ id: 42 }), true, "expected number id to pass (A)");
        assert.strictEqual(t.check({ id: "abc" }), true, "expected string id to pass (B)");
    }

    typeDifferenceRejectsIncompatibleValue()
    {
        const t = valueOf(
            { id: number() },
            { id: string() }
        );

        assert.strictEqual(t.check({ id: true }), false, "expected boolean id to fail");
        assert.strictEqual(t.check({ id: null }), false, "expected null id to fail");
    }

    typeDifferenceParsesFromJson()
    {
        const t = valueOf(
            { id: number() },
            { id: string() }
        );

        assertParseSuccess(t.parseString('{"id":42}'), { id: 42 });
        assertParseSuccess(t.parseString('{"id":"abc"}'), { id: "abc" });
    }

    literalFieldDiscriminatesObjects()
    {
        const t = valueOf(
            { type: "vehicle", wheels: number() },
            { type: "animal", legs: number() }
        );

        assert.strictEqual(t.check({ type: "vehicle", wheels: 4 }), true, "expected Vehicle to pass");
        assert.strictEqual(t.check({ type: "animal", legs: 4 }), true, "expected Animal to pass");
    }

    literalFieldRejectsWrongDiscriminator()
    {
        const t = valueOf(
            { type: "vehicle", wheels: number() },
            { type: "animal", legs: number() }
        );

        // "plant" matches neither literal
        assert.strictEqual(t.check({ type: "plant", leaves: 3 }), false, "expected unknown discriminator to fail");
    }

    literalFieldRejectsWrongBodyForDiscriminator()
    {
        const t = valueOf(
            { type: "vehicle", wheels: number() },
            { type: "animal", legs: number() }
        );

        // type says vehicle, but missing wheels
        assert.strictEqual(t.check({ type: "vehicle" }), false, "expected missing required field for Vehicle to fail");
        // type says animal, but legs has wrong type
        assert.strictEqual(t.check({ type: "animal", legs: "four" }), false, "expected wrong type on Animal legs to fail");
    }

    literalFieldParsesFromJson()
    {
        const t = valueOf(
            { type: "vehicle", wheels: number() },
            { type: "animal", legs: number() }
        );

        assertParseSuccess(t.parseString('{"type":"vehicle","wheels":4}'), { type: "vehicle", wheels: 4 });
        assertParseSuccess(t.parseString('{"type":"animal","legs":4}'), { type: "animal", legs: 4 });
    }

    objectAndPrimitiveMixedInValueOf()
    {
        const t = valueOf(
            { username: string(), age: number() },
            number,
            string
        );

        assert.strictEqual(t.check({ username: "alice", age: 30 }), true, "expected object shape to pass");
        assert.strictEqual(t.check(42), true, "expected number to pass");
        assert.strictEqual(t.check("hello"), true, "expected string to pass");
        assert.strictEqual(t.check(true), false, "expected boolean to fail");
    }
}

// ============================================================
// Custom validators on variadics and their branches
// ============================================================

export class VariadicCustomValidatorTests
{
    branchValidatorsApplyDuringValidation()
    {
        const t = valueOf(number().accepts((v: number) => v > 0), string);

        assert.strictEqual(t.check(1), true);
        assert.strictEqual(t.check("text"), true);
        assert.strictEqual(t.check(-1), false);
    }

    branchContextValidatorsApplyDuringValidation()
    {
        const t = valueOf(number().accepts((v: number, context: ValidationContext) =>
        {
            if (v < 0) context.rejectWith(ValidationIssue, "Negative number");
        }), string);

        assert.strictEqual(t.check(1), true);
        assert.strictEqual(t.validate(-1, { mode: "thorough" }).success, false);
    }

    ownValidatorRejectsParsedValue()
    {
        const t = oneOf(1, 2).accepts((v: number) => v !== 2);

        assertParseSuccess(t.parseString("1"), 1);
        assert.strictEqual(t.parseString("2").success, false);
    }

    ownValidatorFallsBackToTheNextParsedCandidate()
    {
        // "-1" parses as number first, which the validator rejects, so the string candidate wins
        const t = valueOf(number, string).accepts((v: number | string) => typeof v === "string" || v > 0);

        assertParseSuccess(t.parseString("5"), 5);
        assertParseSuccess(t.parseString("-1"), "-1");
    }
}

// ============================================================
// Literals parse like their primitive and take its priority,
// so number literals are tried before string literals
// ============================================================

export class VariadicLiteralParsingTests
{
    mixedTypeLiteralsParseWithTheirOwnPrimitive()
    {
        assertParseSuccess(oneOf("a", 1).parseString("1"), 1);
        assertParseSuccess(oneOf("a", 1).parseString("a"), "a");
        assertParseSuccess(oneOf(1, "a").parseString("a"), "a");
        assertParseSuccess(oneOf(1, "a").parseString("1"), 1);
    }

    mixedTypeLiteralsCheckByType()
    {
        assert.strictEqual(oneOf("a", 1).check(1), true);
        assert.strictEqual(oneOf("a", 1).check("1"), false);
    }

    numberLiteralParsesBeforeStringType()
    {
        const t = valueOf("a", 1, string);

        assertParseSuccess(t.parseString("1"), 1);
        assertParseSuccess(t.parseString("a"), "a");
        assertParseSuccess(t.parseString("2"), "2");
    }

    sameTypeLiteralUnionsStillParse()
    {
        assertParseSuccess(oneOf("x", "y").parseString("y"), "y");
        assertParseSuccess(oneOf(1, 2).parseString("2"), 2);
        assert.strictEqual(oneOf("x", "y").parseString("z").success, false);
        assert.strictEqual(oneOf(1, 2).parseString("3").success, false);
    }

    numberLiteralWinsOverEqualStringLiteralRegardlessOfOrder()
    {
        assertParseSuccess(oneOf("1", 1).parseString("1"), 1);
        assertParseSuccess(oneOf(1, "1").parseString("1"), 1);
    }

    literalMixedWithItsOwnPrimitiveParses()
    {
        assertParseSuccess(valueOf(1, number).parseString("1"), 1);
        assertParseSuccess(valueOf(1, number).parseString("2"), 2);
        assertParseSuccess(valueOf("a", string).parseString("b"), "b");
        assert.strictEqual(valueOf(1, number).parseString("x").success, false);
    }
}

export class VariadicJSONSchemaTests
{
    variadicsExportAsAnyOf()
    {
        assert.deepStrictEqual(withoutDialect(valueOf(string, { id: number() }).toJSONSchema()), {
            anyOf: [
                { type: "object", properties: { id: { type: "number" } }, required: ["id"], additionalProperties: false },
                { type: "string" },
            ],
        });
    }

    literalsMixedWithTypesStayAnyOf()
    {
        assert.deepStrictEqual(withoutDialect(valueOf("auto", number).toJSONSchema()), {
            anyOf: [{ type: "number" }, { type: "string", const: "auto" }],
        });
    }

    variadicDefaultsBecomeSchemaDefaults()
    {
        const t = valueOf(number, string).withDefault("auto");
        assert.deepStrictEqual(withoutDialect(t.toJSONSchema()), { anyOf: [{ type: "number" }, { type: "string" }], default: "auto" });
    }
}
