import { USER_EVENT_ACTIONS } from '#core/generator.constants.ts'
import { generateStepCode } from '#core/generator.shared.ts'
import type { GeneratedTest, GeneratorOptions } from '#core/generator.types.ts'
import { describeBlock, importBlock } from '#templates/test-template.ts'
import type { NormalizedRecording } from '#types/recording.ts'

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
