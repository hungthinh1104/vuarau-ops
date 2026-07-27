# Environment layout

The API and Next application do not share a credential file in a deployment.

| Runtime | Development template               | Pilot template               | Contains                                          |
| ------- | ---------------------------------- | ---------------------------- | ------------------------------------------------- |
| API     | `apps/api/env.development.example` | `apps/api/env.pilot.example` | database URL and token verification configuration |
| Web     | `apps/web/env.development.example` | `apps/web/env.pilot.example` | public Supabase URL/key and API origin only       |

`APP_ENV=pilot` is the repository's real-deployment mode. There is no separate
`production` value: configuration accepts only `development` and `pilot`.

For a laptop, copy the API template to `apps/api/.env` and the web template to
`apps/web/.env.local`, then replace placeholders through a password manager or
local secret mechanism. Node operations still require those variables to be
exported, for example `set -a; source apps/api/.env; set +a`.

For a pilot, do not copy a filled file to the repository or a device. Set the
API template's variables in the API deployment secret store, and set the web
template's variables in the Next build environment. A pilot uses JWKS and must
not receive an HS256 JWT secret.
