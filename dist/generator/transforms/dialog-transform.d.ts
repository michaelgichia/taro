/**
 * Dialog transform - converts dialog flows into optimized test code
 *
 * This module transforms detected DialogFlow objects into cleaner,
 * more maintainable test code with helper functions.
 *
 * Output:
 * - openDialog() helper function
 * - Test steps that call helper + fill fields
 * - Optional close verification
 */
import type { DialogFlow } from '../../parser/steps/dialog-detector.js';
export interface TransformedStep {
    type: 'helper' | 'action' | 'assertion';
    code: string;
    description: string;
}
export interface DialogTestTemplate {
    helpers: TransformedStep[];
    testSteps: TransformedStep[];
    cleanup?: TransformedStep[];
}
/**
 * Transform dialog flows into optimized test code
 *
 * @param flows - Array of detected dialog flows
 * @returns Transformed steps ready for code generation
 */
export declare function transformDialogFlows(flows: DialogFlow[]): DialogTestTemplate[];
/**
 * Generate complete test code from a dialog template
 */
export declare function generateDialogTestCode(template: DialogTestTemplate): string;
export default transformDialogFlows;
//# sourceMappingURL=dialog-transform.d.ts.map