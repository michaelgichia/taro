import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

const sourceFiles = ["**/*.{js,mjs,ts,tsx}"];
const testFiles = [
  "tests/**/*.ts",
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "sample/**/*.test.ts",
  "sample/**/*.test.tsx",
];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      ".next/**",
    ],
  },
  eslint.configs.recommended,
  prettierConfig,
  {
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, JSX: "readonly", NodeJS: "readonly" },
    },
    rules: { "no-unused-vars": "off", "no-useless-escape": "warn" },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: { ...globals.node, JSX: "readonly", NodeJS: "readonly" },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-useless-escape": "warn",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: testFiles,
    languageOptions: {
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
        test: "readonly",
        JSX: "readonly",
        NodeJS: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
];
