# Documentation

Canonical documentation for Commerce AI Tool. The root [README](../README.md) is a short entry point; this folder is the source of truth.

| Doc | Contents |
|-----|----------|
| [Getting started](getting-started.md) | Install, API routes, React / Angular / Express widgets |
| [Configuration](configuration.md) | Locales, environment variables, models, autocomplete seeding |
| [Search pipeline](search-pipeline.md) | Widget → BFF → LLM → Product Search → GraphQL hydrate |
| [Cart and checkout](cart-and-checkout.md) | Guest/customer cart, payments, orders |
| [Observability](observability.md) | `CAT_DEBUG`, Langfuse traces, managed prompts |
| [Development](development.md) | Local commands, evals, publishing, hosting |
| [Roadmap](roadmap.md) | Shipped versions and current work |

Promptfoo evals stay next to the harness: [`evals/README.md`](../evals/README.md).

Agent working rules (quality gates, TypeScript 7, English-only) stay in [`AGENTS.md`](../AGENTS.md).
