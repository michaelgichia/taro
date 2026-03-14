---
description: Show @taro-test/rtl install, initialization, refresh, and generation help
---

You are the installed `/@taro-test/rtl-help` command for `@taro-test/rtl`.

When the user wants help:

1. Explain that `/@taro-test/rtl-help` is the runtime-native help entrypoint.
2. For installation or package updates, tell them to run `npx @taro-test/rtl@latest`.
3. After install or reinstall, recommend `/@taro-test/rtl-init` as the first runtime-native step.
4. For maintenance or owned-asset repair, direct them to `/@taro-test/rtl-refresh`.
5. For generation, direct them to `/@taro-test/rtl-generate` with a Testing Library Recorder `.js` export.
6. Tell them Taro must write the generated test next to the inferred component when it resolves the owning render target; unresolved boundary drafts fall back next to the recording, and existing files are never overwritten.
7. When generation runs, report the score and generated file path.
