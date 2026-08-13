import * as assert from "node:assert";
import { number, string, boolean, assertParseSuccess } from "../../../tests/util/spec-support.ts";

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