/**
 * Chrome Recorder JSON parser
 * Parses and normalizes Chrome Recorder exports to internal format
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
let stepIdCounter = 0;
/**
 * Generate unique step IDs
 */
function generateStepId() {
    return `step_${++stepIdCounter}`;
}
/**
 * Map Chrome Recorder step type to action name
 */
function getActionName(type) {
    const actionMap = {
        click: 'click',
        fill: 'fill',
        select: 'select',
        scroll: 'scroll',
        assert: 'assert',
        waitForSelector: 'waitForSelector',
        doubleClick: 'doubleClick',
        keyDown: 'keyDown',
        navigate: 'navigate'
    };
    return actionMap[type] || type;
}
/**
 * Extract selector from Chrome step
 */
function extractSelector(step) {
    if (step.selectors && step.selectors.length > 0) {
        // Take the first selector array, return first priority selector
        const firstSelectorArray = step.selectors[0];
        if (firstSelectorArray && firstSelectorArray.length > 0) {
            return firstSelectorArray[0];
        }
    }
    return step.target;
}
/**
 * Normalize a single Chrome step to internal format
 */
export function normalizeStep(step, index) {
    const normalized = {
        id: generateStepId(),
        type: step.type,
        action: getActionName(step.type),
        target: step.target || '',
        selector: extractSelector(step),
        timestamp: step.modifiedTime,
        metadata: {}
    };
    if (step.value !== undefined) {
        normalized.value = step.value;
    }
    if (step.assert) {
        normalized.metadata = {
            ...normalized.metadata,
            assertExpression: step.assert.expression
        };
    }
    if (step.url) {
        normalized.metadata = {
            ...normalized.metadata,
            url: step.url
        };
    }
    return normalized;
}
/**
 * Parse Chrome Recorder JSON file to normalized recording
 */
export async function parseRecording(filePath) {
    const absolutePath = resolve(process.cwd(), filePath);
    const content = await readFile(absolutePath, 'utf-8');
    let exportData;
    try {
        exportData = JSON.parse(content);
    }
    catch (error) {
        throw new Error(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    if (!exportData.steps || !Array.isArray(exportData.steps)) {
        throw new Error(`Invalid Chrome Recorder export: missing or invalid "steps" array`);
    }
    // Reset step counter for each new recording
    stepIdCounter = 0;
    const normalizedSteps = exportData.steps.map((step, index) => normalizeStep(step, index));
    return {
        title: exportData.title || 'Untitled Recording',
        steps: normalizedSteps,
        url: exportData.settings?.url,
        settings: exportData.settings
    };
}
/**
 * Reset step counter (useful for testing)
 */
export function resetStepCounter() {
    stepIdCounter = 0;
}
//# sourceMappingURL=parser.js.map