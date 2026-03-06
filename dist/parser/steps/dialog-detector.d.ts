/**
 * Dialog flow detector - detects and groups multi-step dialog interactions
 *
 * This module identifies dialog open/close flows and other multi-step interactions
 * as logical units, improving test readability and reducing redundant assertions.
 *
 * Detection patterns:
 * - Open dialog: click on modal trigger → dialog appears
 * - Fill dialog: fill form fields in dialog
 * - Submit dialog: click submit/confirm in dialog
 * - Close dialog: click close/ESC/cancel outside
 *
 * Time window: related steps within 30s are grouped
 */
import type { RecordingStep } from '../../types/recording.js';
export type DialogType = 'modal' | 'drawer' | 'popover' | 'confirm' | 'form';
export interface DialogFlow {
    id: string;
    type: DialogType;
    triggerStep: RecordingStep;
    contentSteps: RecordingStep[];
    closeStep?: RecordingStep;
    assertionStep?: RecordingStep;
    timestamp: number;
}
/**
 * Group recording steps into dialog flows
 *
 * @param steps - Array of recording steps (should be after deduplication and noise filtering)
 * @returns Array of detected dialog flows
 */
export declare function groupDialogSteps(steps: RecordingStep[]): DialogFlow[];
/**
 * Reset dialog ID counter (useful for testing)
 */
export declare function resetDialogIdCounter(): void;
export default groupDialogSteps;
//# sourceMappingURL=dialog-detector.d.ts.map