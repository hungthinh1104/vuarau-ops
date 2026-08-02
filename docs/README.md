# Documentation authority map

The repository has accumulated documents for product policy, domain rules, API
contracts, UI design, QA, and operations. They do not all have the same authority.
When two documents disagree, use the order below instead of choosing the newer or
more convenient prose.

## Authority order

1. **Runtime and persistence facts** — database schema/migrations, domain contracts,
   domain kernel and executable authorization/business rules describe what the
   software actually accepts and persists.
2. **Recorded business decisions** — accepted ADRs, decision-backlog entries and
   product invariants describe intentional policy. An unresolved operational action
   or deferred decision must not be rewritten as settled depot policy.
3. **Normative business documentation** — business rules, use cases and state/
   transition catalogs explain the accepted behavior and must match levels 1–2.
4. **Published interface contracts** — command contracts, read models, capabilities
   and error/UI-state catalogs mirror the executable contract. They are not allowed
   to preserve an obsolete vertical-slice description after the contract grows.
5. **UI policy** — `design.md` governs interaction and presentation. It may name
   future desired states, but those states are not delivered until backed by a
   current contract, fixture/story where applicable, and evidence.
6. **Evidence and release status** — QA traceability, scope and roadmap describe what
   is implemented/proven. They must not promote repository or pilot readiness beyond
   the evidence actually present.

## Document roles

| Area                               | Role                                      | Authority             |
| ---------------------------------- | ----------------------------------------- | --------------------- |
| `00-product/product-invariants.md` | Cross-context invariants                  | normative             |
| `00-product/scope.md`              | Current delivered boundary                | status mirror         |
| `00-product/roadmap.md`            | Milestone/evidence status                 | status mirror         |
| `01-domain/`                       | Vocabulary and context boundaries         | normative/explanatory |
| `02-use-cases/`                    | Actor-visible workflow contracts          | normative             |
| `03-state-machines/`               | Lifecycle and derived-state contracts     | normative             |
| `04-business-rules/`               | Business rules and authorization          | normative             |
| `05-casebook/`                     | Worked examples supporting rules          | evidence/explanatory  |
| `06-api-contracts/`                | Published command/read/error/UI contracts | contract mirror       |
| `07-data/`                         | Human-readable persistence model          | schema mirror         |
| `08-qa/`                           | Test strategy and traceability            | evidence              |
| `09-decisions/`                    | ADRs and unresolved/operational policy    | normative policy      |
| `10-ai-coding/`                    | Engineering workflow for agents           | process               |
| `11-operations/`                   | Deployment/recovery/pilot procedures      | operational contract  |
| `design.md`                        | UI design and state policy                | normative UI policy   |

## Drift rule

A document that mirrors code must say so and point to its executable source of
truth. If a feature changes across bounded contexts, update the mirrors in the same
change or mark the repository readiness gate pending. Historical milestone prose may
describe an earlier model only when it explicitly says a later milestone superseded
that detail.

Automated checks can prove structure and selected consistency invariants; they do
not prove that prose is semantically true. `pnpm truth:check` protects the mirrors
that can be compared mechanically: router procedure catalogs, schema-table catalog,
navigation routes, selected stale-contract claims, ASM identifier continuity and
the critical screen Storybook checklist. Review still compares normative docs to
the executable contracts before a readiness claim is promoted.

## Agent retrieval

Codex starts with this authority map and `10-ai-coding/REPO_MAP.md`, then runs
`pnpm context <query>` to resolve exact IDs through `08-qa/trace-map.yml`. The
command excludes `archive/` by default. Archive documents are historical context,
not active product or engineering authority.
