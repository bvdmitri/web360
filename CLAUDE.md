# web360: operating manual

web360 is a library of functions to read, analyse, stitch, stabilize and process 360 video in
the browser. It is not a player. This file is the operating manual for anyone (human or agent)
changing the code.

It reads Insta360 (`.insv`) and GoPro (`.360`) recordings today. DJI (`.osv`) is planned but not
started: its layout is not yet described by a fixture, so it is reported as unsupported until it
is (rule 5).

## How to start any task

1. Read the relevant doc in `docs/` before touching an area. `docs/` is the source of truth.
2. If the docs do not cover what you need, ask. Once decided, update the doc in the same change.
3. Write the failing test first, then the code that makes it pass, then refactor.
4. If a change contradicts a doc, stop and ask whether to change the doc or the code. A code
   change that contradicts its doc is incomplete.

## Where things are described

| Topic                                          | Document                                           |
| ---------------------------------------------- | -------------------------------------------------- |
| Layers, packages, dependency rules, public API | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)     |
| Private samples and committed fixtures         | [docs/SAMPLES.md](./docs/SAMPLES.md)               |
| File formats, one per vendor                   | `docs/FORMAT-<vendor>.md` (added with each reader) |
| Decisions and their reasons                    | `docs/adr/`                                        |

## Hard rules

1. **TDD, always.** Every function starts as a failing test. Parsers and maths also get
   property tests (fast-check). Coverage gates: 95% lines, 90% branches. Mutation testing
   (Stryker) on the core breaks below 80%.
2. **The core is pure.** No browser API, no Node API, no npm runtime dependency in
   `packages/core`. I/O, codecs and the GPU are adapters behind ports.
3. **Only `format/` reads bytes.** Everything else receives decoded values in the common model.
   Vendor readers never import each other.
4. **No player.** No playback state, clocks, audio sync or UI in any published package.
   Examples live in `examples/` and are not published.
5. **A camera body is supported only when documented.** Its format facts are in
   `docs/FORMAT-<vendor>.md`, stated plainly as facts about the file, and a fixture covers it.
   A body without both is reported as unsupported, never guessed.
6. **Formats are described as facts.** A format doc says what the bytes mean ("record 3 holds gyro
   samples: ..."), with units, byte order and the camera bodies it was verified on. Byte order is
   stated per record and differs by vendor (Insta360 is little-endian, GoPro's GPMF is
   big-endian); never assume one order across readers.
7. **Vendor formats are derived independently.** A format doc states facts we verified against our
   own fixtures, and a reader is written from those facts and from published methods, not copied
   from another project. A fact a fixture cannot yet confirm is marked provisional until one does.
   A public format reference may be pointed to for a maintainer; our own tooling and workflow are
   never part of the docs.
8. **Strict lint, zero warnings.** Complexity 8, nesting 3, 30 lines a function, 300 lines a
   file, 3 parameters, no magic numbers. Fix the design rather than disable a rule.
9. **Units are types.** Use the branded units in `shared/units`; convert explicitly.
10. **Document contracts with TSDoc.** Exported types and functions that other modules rely on get
    a docstring: a one-line summary, then why, when, and the invariants. Do not restate the type.
11. **Comments and docs describe the present.** No "previously", "used to", "no longer". History
    belongs in git and the changelog.
12. **No em or en dashes** anywhere: code, comments, docs, commit messages. The repository
    checks reject them.
13. **Private samples never leak.** Nothing from `samples/` or its catalogue terms reaches a
    commit; the pre-commit and commit-msg hooks enforce it.
14. **Pin everything.** Exact dependency versions, a committed lockfile, CI actions pinned to a
    commit.
15. **Keep `CHANGELOG.md` current** for every user-visible change.

## Commands

```sh
pnpm verify          # the full gate: checks, typecheck, lint, format, dependency rules, tests
pnpm test            # all tests
pnpm vitest run --project core   # one project
pnpm test:mutation   # Stryker on the core
pnpm checks          # repository checks over every tracked file
```

Run `pnpm verify` before calling any change done.
