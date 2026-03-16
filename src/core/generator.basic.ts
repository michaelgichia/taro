import type { NormalizedRecording } from '../types/recording.js'
import { describeBlock, importBlock } from '../templates/test-template.js'
import { USER_EVENT_ACTIONS } from './generator.constants.js'
import { generateStepCode } from './generator.shared.js'
import type { GeneratedTest, GeneratorOptions } from './generator.types.js'

export function generateTest(
  recording: NormalizedRecording,
  options: GeneratorOptions = {}
): GeneratedTest {
  const testName = recording.title || 'Generated Test'

  const hasUserEvents = recording.steps.some((step) =>
    USER_EVENT_ACTIONS.includes(step.action as (typeof USER_EVENT_ACTIONS)[number])
  )

  const stepLines = recording.steps.map((step) => generateStepCode(step))
  const imports = importBlock(hasUserEvents)
  const describe = describeBlock(testName, stepLines, hasUserEvents)
  const code = `${imports}\n\n${describe}\n`

  return {
    code,
    testName,
    filePath: options.outputPath,
  }
}
