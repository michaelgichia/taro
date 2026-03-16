import type { ConventionsSchema } from '#types/conventions.ts'
import type {
  ItGroup,
  JsHelperPlan,
  JsScenarioPlan,
  QueryResult,
} from '#types/recording.ts'
import type {
  RepoRenderTargetCandidate,
  TaroRenderHelperProfile,
  TaroTestRunner,
} from '#types/state.ts'

export interface GeneratorOptions {
  outputPath?: string
}

export interface GeneratedTest {
  code: string
  testName: string
  filePath?: string
}

export interface GeneratedTestV3 extends GeneratedTest {
  queryResults?: QueryResult[]
  itGroupCount?: number
}

export interface GenerateFromGroupsOptions {
  outputPath?: string
  conventions?: ConventionsSchema
  runner?: TaroTestRunner
  queryResults?: QueryResult[]
  helpers?: JsHelperPlan[]
  scenarios?: JsScenarioPlan[]
  renderTarget?: RepoRenderTargetCandidate | null
  renderHelper?: TaroRenderHelperProfile | null
}

export interface GenerateTestFromGroupsInput {
  title: string
  itGroups: ItGroup[]
  options?: GenerateFromGroupsOptions
}
