#!/usr/bin/env node

import { findReadableStatePath } from "./state-paths.js";

const projectRoot = process.cwd();
const hasState =
  (await findReadableStatePath(projectRoot, "state.json")) !== null;
const hasVisualState =
  (await findReadableStatePath(projectRoot, "visual")) !== null;

console.log(
  `Taro | state:${hasState ? "yes" : "no"} | visual:${hasVisualState ? "yes" : "no"}`
);
