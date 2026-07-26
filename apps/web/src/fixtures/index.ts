/**
 * Typed sample data for stories and component tests.
 *
 * Two rules make these worth having:
 *
 * **They are parsed through the published schemas.** `fixtures.contract.test.ts`
 * runs every fixture in this folder through the Zod schema the server validates
 * against, so a DTO that changes shape breaks the stories rather than shipping a
 * design system that renders a contract nobody serves any more.
 *
 * **They need no backend.** Every story is a fixed DTO plus a fixed rejection.
 * A Storybook that has to be pointed at a running API is a Storybook nobody opens.
 *
 * Ids and instants come from `@vuarau/test-fixtures`, the same ones the backend
 * tests use, so a fixture on screen and a row in a database test are the same
 * sale. Only the DTO shapes are assembled here — the shared package models
 * aggregates, and a browser has no aggregates.
 */
export * from "./session.fixtures.ts";
export * from "./customer.fixtures.ts";
export * from "./sale.fixtures.ts";
export * from "./payment.fixtures.ts";
export * from "./account.fixtures.ts";
export * from "./rejection.fixtures.ts";
