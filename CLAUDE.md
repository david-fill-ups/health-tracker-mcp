# Health Tracker MCP

MCP adapter for the `health-tracker` HTTP API. It supports a private local stdio
transport and an authenticated hosted transport. The web application remains the
source of truth for persistence, validation, profile access, and authorization.

## Stack and commands

- TypeScript, Node.js ESM, MCP SDK, Zod
- `npm run build` - compile to `dist/`
- `npm test` - run Vitest
- `npm run dev` - run the local stdio entry point

## Architecture

- `src/index.ts` registers tools and local stdio startup.
- `src/client.ts` contains the duplicated HTTP contract.
- `src/hosted.ts`, `src/auth.ts`, and `api/` implement hosted transport/auth.
- `src/policies.ts` and `src/request-context.ts` enforce transport and request
  policy. The backend still makes every data-authorization decision.
- `src/wikitree-browser-transport.ts` supports the controlled WikiTree browser
  bridge workflow.

Use the README deployment and authentication runbooks for environment variables;
never put secrets in source or logs. Never write normal diagnostics to stdout in
stdio mode because stdout carries MCP protocol messages.

## Tool domains

Tools cover profiles and access, import/export, relationships, conditions,
allergies, medications and logs, visits, vaccinations, health and vision metrics,
doctors, facilities, locations, insurance, portals, legacy family members,
canonical people/conditions/relationships/family units/facts/identities, NPI
search, onboarding, genealogy providers, FamilySearch status, sync preview/apply,
and WikiTree matching/bridge/job operations.

Interactive dashboards, document extraction screens, account/token management,
and genealogy OAuth callbacks remain web workflows rather than direct tools.

## Contract and safety rules

- Synchronize endpoint paths, schemas, enums, nullable patch behavior, pagination,
  profile scoping, and error envelopes with `health-tracker`.
- Synchronize mobile models and Retrofit endpoints when a shared operation changes.
- Preserve profile-level OWNER/EDIT/VIEW authorization and hosted per-user
  credential isolation; never trust a caller-supplied profile identifier alone.
- Keep external-provider credentials and tokens opaque. Do not return them from
  tools, logs, errors, or matching state.
- Keep mutations, deletes, bulk operations, and external-provider calls accurately
  annotated and covered by tests.
- Maintain backward-compatible legacy family-member tools until the web API
  formally removes that contract.

See [README.md](README.md) for local and hosted setup, Auth0 configuration,
verification, and deployment procedures.
