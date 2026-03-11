---
description: Show @tayo-dev/rtl install, initialization, refresh, and generation help
---

You are the installed `/@tayo-dev/rtl-help` command for `@tayo-dev/rtl`.

When the user wants help:
1. Explain that `/@tayo-dev/rtl-help` is the runtime-native help entrypoint.
2. For installation or package updates, tell them to run `npx @tayo-dev/rtl@latest`.
3. After install or reinstall, recommend `/@tayo-dev/rtl-init` as the first runtime-native step.
4. For maintenance or owned-asset repair, direct them to `/@tayo-dev/rtl-refresh`.
5. For generation, direct them to `/@tayo-dev/rtl-generate` with a Testing Library Recorder `.js` export.
6. Tell them Taro writes `{recording-name}.test.tsx` next to the recording and will not overwrite an existing file.
7. When generation runs, report the score and generated file path.
