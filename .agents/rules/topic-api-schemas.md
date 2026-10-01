---
trigger: glob
globs: "**/*.proto,**/*.graphql,**/*.gql,**/openapi*.yaml,**/openapi*.json,**/swagger*.yaml,**/swagger*.json"
description: "API contract card for Protobuf, GraphQL and OpenAPI: lint/breaking-change/codegen commands, compatibility invariants, co-changes, bad->good example. Loaded when editing API schema files."
---
# API schemas - topic card
Principles guide: `.agents/guides/principles/api-design.md` - read it before adding an endpoint, changing an error shape, pagination or versioning. The schema is a contract with clients you cannot see: treat every change as public.

## Toolchain (use the project's scripts and config first: buf.yaml, codegen.ts/.yml, openapitools.json, redocly.yaml, .spectral.yaml)
- Protobuf: `buf lint` - `buf breaking --against ".git#branch=main"` - `buf generate` (or the project's `protoc` command).
- GraphQL: the project's codegen (`npx graphql-codegen` when codegen.ts exists); `graphql-inspector diff <old> <new>` for breaking changes if installed.
- OpenAPI: `npx @redocly/cli lint <file>` or `npx @stoplight/spectral-cli lint <file>`; `oasdiff breaking <old> <new>` if installed; regenerate clients/servers with the project's generator.
- Bun projects: `bunx` instead of `npx`. Then `node .agents/scripts/verify.mjs`.

## Invariants (MUST / NEVER - with reason -> alternative)
1. Changes are additive by default: add optional fields, new endpoints, new enum values at the end - deployed clients keep working. Removing or renaming a field, changing a type, making an optional field required, or tightening validation is BREAKING -> the user's OK first (not in your brief -> `INPUT GAP:`), then deprecate and add a new version or field.
2. Protobuf: NEVER reuse or renumber a field number, and never change a field's type - old binaries decode the wrong data silently. Instead add a new field and put deleted numbers and names in `reserved`.
3. Protobuf proto3: the first enum value is `<ENUM>_UNSPECIFIED = 0` - zero is the default for unset fields, so it must not mean a real state.
4. GraphQL: deprecate with `@deprecated(reason: "Use fullName")` and keep the field until clients have moved; changing a nullable field to non-null in an input, or non-null to nullable in an output, breaks clients.
5. OpenAPI: every operation has an `operationId`, request and response schemas, and documented error responses in ONE error shape (the project's, or RFC 9457 `application/problem+json`). List endpoints are paginated from the start (cursor or page + limit, with a max).
6. The schema is the source of truth: regenerate code after every schema edit and update the handwritten side (handlers, resolvers, clients, tests, docs, changelog) in the same change. Never hand-edit generated files - the next codegen run overwrites them.
7. Keep naming consistent with the existing schema (casing, plural resources, ID format, timestamps as RFC 3339 strings or `google.protobuf.Timestamp`) - mixed conventions are a defect clients must work around.

## Pitfalls Flash models get wrong
- Inventing fields or endpoints the backend does not implement. Search the handlers/resolvers first (`node .agents/scripts/search.mjs "<operationId|field>"`).
- A new required request field breaks every existing caller. Make it optional with a server-side default.
- Adding an enum value can break clients with exhaustive switches. Say so in the report, and document the unknown-value behaviour.
- `buf breaking` needs a baseline. Not a git repo -> compare against a copy of the old file, or say the check was skipped.
- OpenAPI `nullable: true` is 3.0 syntax; 3.1 uses `type: [string, "null"]`. Match the file's `openapi:` version.
- GraphQL lists: `[Item!]!` vs `[Item]` change client null handling. Keep the existing pattern.
- Generated code is often committed or checked in CI. If a generated diff looks huge, check the generator version against the lockfile before committing it.

## Example - bad -> good
```proto
// BAD: field 2 renamed and retyped in place; old clients misread the bytes
message User {
  string id = 1;
  int64 full_name = 2;   // was: string name = 2;
}
```
```proto
// GOOD: old number and name reserved, new field added
message User {
  reserved 2;
  reserved "name";
  string id = 1;
  string full_name = 3;
}
```

## Before finishing
- [ ] Lint passes; breaking-change check ran (or SKIP with reason); any breaking change was approved by the user
- [ ] Code regenerated; handlers, clients, tests and docs updated together
- [ ] Errors use the one shared shape; new list endpoints paginate
- [ ] `node .agents/scripts/verify.mjs` passes
