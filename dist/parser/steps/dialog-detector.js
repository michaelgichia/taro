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
const DIALOG_TIME_WINDOW_MS = 30000; // 30 seconds
/**
 * Dialog-related selectors that indicate a dialog is opening
 */
const DIALOG_TRIGGER_SELECTORS = [
    '[data-testid*="modal"]',
    '[data-testid*="dialog"]',
    '[data-testid*="drawer"]',
    '[data-testid*="popover"]',
    '[aria-haspopup]',
    '[role="dialog"]',
    '[role="dialog"][aria-modal="true"]',
];
/**
 * Selectors that indicate a dialog close action
 */
const DIALOG_CLOSE_SELECTORS = [
    '.close',
    '[class*="close"]',
    '[aria-label="Close"]',
    '[aria-label="close"]',
    '[aria-label="Close dialog"]',
    '[data-testid*="close"]',
    '[data-testid*="Cancel"]',
    '[role="button"][aria-label="Close"]',
];
/**
 * Dialog content selectors that indicate dialog is open
 */
const DIALOG_CONTENT_SELECTORS = [
    '[role="dialog"]',
    '[role="dialog"][aria-modal="true"]',
    '[role="alertdialog"]',
    '[data-testid*="modal"]',
    '[data-testid*="dialog"]',
    '[data-testid*="drawer"]',
    '[class*="modal"]',
    '[class*="dialog"]',
    '[class*="drawer"]',
];
/**
 * Check if a selector is a dialog trigger
 */
function isDialogTrigger(step) {
    const selector = step.selector || step.target || '';
    const lowerSelector = selector.toLowerCase();
    // Check explicit selectors
    for (const triggerSelector of DIALOG_TRIGGER_SELECTORS) {
        if (selectorMatches(selector, triggerSelector)) {
            return true;
        }
    }
    // Check for common trigger patterns in selector
    const triggerPatterns = ['modal', 'dialog', 'drawer', 'popover', 'open', 'show'];
    return triggerPatterns.some(pattern => lowerSelector.includes(pattern));
}
/**
 * Check if a selector matches a pattern
 */
function selectorMatches(selector, pattern) {
    if (!selector || !pattern)
        return false;
    // Handle attribute selectors
    if (pattern.startsWith('[')) {
        return selector.includes(pattern);
    }
    // Simple substring match for class/ID selectors
    return selector.includes(pattern);
}
/**
 * Check if a step is a dialog close action
 */
function isDialogCloseAction(step) {
    const action = step.action?.toLowerCase() || '';
    const selector = step.selector || step.target || '';
    const lowerSelector = selector.toLowerCase();
    // Check explicit close selectors
    for (const closeSelector of DIALOG_CLOSE_SELECTORS) {
        if (selectorMatches(selector, closeSelector)) {
            return true;
        }
    }
    // Check for cancel/close in action or selector
    const closePatterns = ['close', 'cancel', 'dismiss', 'esc', 'escape'];
    if (closePatterns.some(pattern => action.includes(pattern) || lowerSelector.includes(pattern))) {
        return true;
    }
    // Check for ESC key press
    if (step.type === 'keyDown' && (step.value === 'Escape' || step.value === 'Esc')) {
        return true;
    }
    return false;
}
/**
 * Check if a step is a click on the dialog overlay (outside the dialog content)
 */
function isDialogOverlayClick(step, dialogOpen) {
    if (!dialogOpen)
        return false;
    // Click on body or html typically means clicking outside dialog
    const selector = step.selector || step.target || '';
    const lowerSelector = selector.toLowerCase();
    return (selector === 'body' ||
        selector === 'html' ||
        lowerSelector.includes('overlay') ||
        lowerSelector.includes('backdrop'));
}
/**
 * Check if a step appears to be filling dialog content
 */
function isDialogContentStep(step) {
    // Fill, select, or keyDown in form elements
    if (step.type === 'fill' || step.type === 'select') {
        return true;
    }
    // KeyDown for typing in input fields
    if (step.type === 'keyDown') {
        const selector = step.selector || step.target || '';
        const lowerSelector = selector.toLowerCase();
        // Input, textarea, or contentEditable elements
        return (lowerSelector.includes('input') ||
            lowerSelector.includes('textarea') ||
            lowerSelector.includes('contenteditable'));
    }
    return false;
}
/**
 * Check if step appears to be an assertion about dialog state
 */
function isDialogAssertion(step) {
    if (step.type !== 'assert' && step.type !== 'waitForSelector') {
        return false;
    }
    const selector = step.selector || step.target || '';
    const lowerSelector = selector.toLowerCase();
    // Check if assertion targets dialog elements
    for (const contentSelector of DIALOG_CONTENT_SELECTORS) {
        if (selectorMatches(selector, contentSelector)) {
            return true;
        }
    }
    // Check for dialog-related keywords
    const dialogKeywords = ['modal', 'dialog', 'drawer', 'popover', 'visible', 'open'];
    return dialogKeywords.some(keyword => lowerSelector.includes(keyword));
}
/**
 * Determine the dialog type based on content
 */
function inferDialogType(steps) {
    // Check selectors for type hints
    for (const step of steps) {
        const selector = step.selector || step.target || '';
        const lowerSelector = selector.toLowerCase();
        if (lowerSelector.includes('drawer'))
            return 'drawer';
        if (lowerSelector.includes('popover'))
            return 'popover';
        if (lowerSelector.includes('confirm') || lowerSelector.includes('alert'))
            return 'confirm';
    }
    // Default to modal
    return 'modal';
}
/**
 * Check if two steps are within the dialog time window
 */
function isWithinTimeWindow(step1, step2) {
    if (step1.timestamp === undefined || step2.timestamp === undefined) {
        // If no timestamps, assume they could be related (conservative)
        return true;
    }
    return Math.abs(step2.timestamp - step1.timestamp) <= DIALOG_TIME_WINDOW_MS;
}
/**
 * Generate a unique ID for a dialog flow
 */
let dialogIdCounter = 0;
function generateDialogId() {
    return `dialog_${++dialogIdCounter}`;
}
/**
 * Group recording steps into dialog flows
 *
 * @param steps - Array of recording steps (should be after deduplication and noise filtering)
 * @returns Array of detected dialog flows
 */
export function groupDialogSteps(steps) {
    if (!steps || steps.length === 0) {
        return [];
    }
    const dialogFlows = [];
    let currentDialog = null;
    let dialogOpen = false;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        // Skip if not a relevant step type
        if (!['click', 'fill', 'select', 'keyDown', 'assert', 'waitForSelector'].includes(step.type)) {
            continue;
        }
        // Case 1: Dialog trigger click - start a new dialog flow
        if (step.type === 'click' && isDialogTrigger(step)) {
            // Close any existing dialog flow
            if (currentDialog) {
                dialogFlows.push(currentDialog);
            }
            currentDialog = {
                id: generateDialogId(),
                type: inferDialogType([step]),
                triggerStep: step,
                contentSteps: [],
                timestamp: step.timestamp || Date.now(),
            };
            dialogOpen = true;
            continue;
        }
        // If we have an active dialog flow
        if (currentDialog) {
            // Case 2: Dialog close action - end the current flow
            if (isDialogCloseAction(step) || isDialogOverlayClick(step, dialogOpen)) {
                currentDialog.closeStep = step;
                dialogFlows.push(currentDialog);
                currentDialog = null;
                dialogOpen = false;
                continue;
            }
            // Case 3: Dialog content step - add to current flow
            if (isDialogContentStep(step)) {
                // Check time window - if too far, might be separate interaction
                if (isWithinTimeWindow(currentDialog.triggerStep, step)) {
                    currentDialog.contentSteps.push(step);
                    continue;
                }
            }
            // Case 4: Dialog assertion - mark for verification
            if (isDialogAssertion(step)) {
                currentDialog.assertionStep = step;
                continue;
            }
            // Case 5: Non-dialog click - might close dialog and end flow
            if (step.type === 'click' && !isDialogTrigger(step)) {
                // Check if this might be closing the dialog
                if (dialogOpen) {
                    currentDialog.closeStep = step;
                    dialogFlows.push(currentDialog);
                    currentDialog = null;
                    dialogOpen = false;
                    continue;
                }
            }
            // Check time window - if step is too far from dialog start, end the flow
            if (!isWithinTimeWindow(currentDialog.triggerStep, step)) {
                if (currentDialog.contentSteps.length > 0 || currentDialog.closeStep) {
                    dialogFlows.push(currentDialog);
                }
                else {
                    // No meaningful content, discard
                }
                currentDialog = null;
                dialogOpen = false;
            }
        }
    }
    // Don't forget the last dialog if still open
    if (currentDialog) {
        dialogFlows.push(currentDialog);
    }
    return dialogFlows;
}
/**
 * Reset dialog ID counter (useful for testing)
 */
export function resetDialogIdCounter() {
    dialogIdCounter = 0;
}
export default groupDialogSteps;
//# sourceMappingURL=dialog-detector.js.map