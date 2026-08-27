import type { PrimitiveType, TemplateObject } from "./definition-interface.ts";

export type CollectionType = ((defaultValue: any[], cloneOnDefaultAssignment?: boolean) => unknown) | ((defaultValue: Record<string, any>, cloneOnDefaultAssignment?: boolean) => unknown);
export type ObjectType = ((value: TemplateObject) => unknown);
export type ExpectedType = PrimitiveType | CollectionType | ObjectType;

export interface ReflectionAPI
{
    readonly type: ExpectedType | readonly ExpectedType[];
    expects(type: ExpectedType): boolean;
    expectsExclusively(type: ExpectedType): boolean;
}

export interface MemberReflectionAPI extends ReflectionAPI
{
    readonly memberType: ExpectedType | readonly ExpectedType[];
    expectsMember(type: ExpectedType): boolean;
    expectsMemberExclusively(type: ExpectedType): boolean;
}
