/**
 * Convention learning types for extracting test patterns
 */

export type NamingPattern = "camelCase" | "kebab-case" | "snake_case";

export interface NamingConventions {
  pattern: NamingPattern;
  describePrefix: string;
  itTemplate: string;
}

export type SetupLocation =
  | "inside-describe"
  | "outside-describe"
  | "beforeeach";

export interface StructureConventions {
  describePerComponent: boolean;
  helpersInDescribe: boolean;
  setupLocation: SetupLocation;
}

export interface QueryPreferences {
  preferred: string[];
  avoided: string[];
}

export interface MatcherConventions {
  common: string[];
}

export interface ImportConventions {
  common: string[];
}

/**
 * TestConvention captures the learned conventions from analyzing test files
 */
export interface TestConvention {
  naming: NamingConventions;
  structure: StructureConventions;
  queries: QueryPreferences;
  matchers: MatcherConventions;
  imports: ImportConventions;
}

export type ConventionKey = keyof TestConvention;

/**
 * Default empty convention
 */
export function createEmptyConvention(): TestConvention {
  return {
    naming: {
      pattern: "camelCase",
      describePrefix: "",
      itTemplate: "should {description}",
    },
    structure: {
      describePerComponent: true,
      helpersInDescribe: false,
      setupLocation: "inside-describe",
    },
    queries: { preferred: [], avoided: [] },
    matchers: { common: [] },
    imports: { common: [] },
  };
}
