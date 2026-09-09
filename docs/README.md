# Documentation

Canonical documentation for Commerce AI Tool. The root [README](../README.md) is a short entry point; this folder is the source of truth.

| Doc | Contents |
|-----|----------|
| [Getting started](GETTING-STARTED.md) | Install, API routes, React / Angular / Express widgets |
| [Configuration](CONFIGURATION.md) | Locales, environment variables, models, autocomplete seeding |
| [Search pipeline](SEARCH-PIPELINE.md) | Widget → BFF → LLM → Product Search → GraphQL hydrate |
| [Cart and checkout](CART-AND-CHECKOUT.md) | Guest/customer cart, payments, orders |
| [Observability](OBSERVABILITY.md) | `CAT_DEBUG`, Langfuse traces, managed prompts |
| [Development](DEVELOPMENT.md) | Local commands, evals, publishing, hosting |
| [Roadmap](ROADMAP.md) | Shipped versions and current work |

Promptfoo evals stay next to the harness: [`evals/README.md`](../evals/README.md).

Agent working rules (quality gates, TypeScript 7, English-only) stay in [`AGENTS.md`](../AGENTS.md).
