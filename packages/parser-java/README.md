# @flowscope/parser-java

The Java parsing adapter: turns Java source into a Java Semantic Model
using JavaParser initially, with Eclipse JDT as a possible later option for
deeper semantic resolution (`MASTER_PLAN.md` §11). Implements
`packages/parser-core`'s abstractions for Java specifically. Isolated from
Spring interpretation (`packages/parser-spring`) and from business
inference (`packages/business-analyzer`).

Note: `MASTER_PLAN.md` designates the long-term analysis engine as Rust
(`apps/parser-engine`), while JavaParser is a JVM library. How this
package's logic is actually invoked (JVM subprocess from the Rust engine,
a Rust-native replacement, or another approach) is an implementation
decision for the sprint that starts real Java parsing — this package
exists now to hold the eventual contract/adapter boundary regardless of
that choice, per the repository structure in `docs/ARCHITECTURE.md`.

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md` /
Weekend 3.
