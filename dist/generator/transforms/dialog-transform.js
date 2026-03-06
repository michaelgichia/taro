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
/**
 * Generate selector query code from a recording step
 */
function generateSelectorQuery(step) {
    const selector = step.selector || step.target || '';
    if (!selector) {
        return 'screen.getByRole("button")';
    }
    // Handle different selector types
    if (selector.startsWith('#')) {
        // ID selector
        const id = selector.slice(1);
        return `screen.getByRole("button", { name: /${id}/i })`;
    }
    if (selector.startsWith('.')) {
        // Class selector - use getByTestId or find by text
        const className = selector.slice(1).replace(/\./g, ' ');
        return `screen.getByText(/${className}/i)`;
    }
    if (selector.includes('[data-testid=')) {
        // data-testid selector
        const match = selector.match(/\[data-testid=["']([^"']+)["']\]/);
        if (match) {
            return `screen.getByTestId("${match[1]}")`;
        }
    }
    if (selector.includes('[')) {
        // Attribute selector
        const match = selector.match(/\[([^=]+)=["']([^"']+)["']\]/);
        if (match) {
            const attr = match[1];
            const value = match[2];
            return `screen.getByRole("button", { name: /${value}/i })`;
        }
    }
    // Default: try to find by text content
    const readableName = selector.split(/[#.\s]/).pop() || 'button';
    return `screen.getByRole("button", { name: /${readableName}/i })`;
}
/**
 * Generate the openDialog helper function
 */
function generateOpenDialogHelper(flow) {
    const triggerSelector = flow.triggerStep.selector || flow.triggerStep.target || '';
    const triggerName = triggerSelector.split(/[#.\s]/).pop() || 'open';
    // Build selector query
    let triggerQuery = '';
    if (triggerSelector.startsWith('#')) {
        const id = triggerSelector.slice(1);
        triggerQuery = `screen.getByRole('button', { name: /${id}/i })`;
    }
    else if (triggerSelector.includes('[data-testid=')) {
        const match = triggerSelector.match(/\[data-testid=["']([^"']+)["']\]/);
        if (match) {
            triggerQuery = `screen.getByTestId("${match[1]}")`;
        }
    }
    else {
        triggerQuery = `screen.getByRole('button', { name: /${triggerName}/i })`;
    }
    // Determine dialog wait condition based on type
    let waitCondition = '';
    switch (flow.type) {
        case 'modal':
            waitCondition = `await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())`;
            break;
        case 'drawer':
            waitCondition = `await waitFor(() => expect(screen.getByTestId('drawer')).toBeInTheDocument())`;
            break;
        case 'popover':
            waitCondition = `await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument())`;
            break;
        case 'confirm':
            waitCondition = `await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument())`;
            break;
        default:
            waitCondition = `await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())`;
    }
    return `const openDialog = async () => {
  await userEvent.click(${triggerQuery});
  ${waitCondition}
};`;
}
/**
 * Generate field fill code from fill/select steps
 */
function generateFillCode(step) {
    const selector = step.selector || step.target || '';
    const value = step.value || '';
    // Build query for the field
    let fieldQuery = '';
    if (selector.includes('[data-testid=')) {
        const match = selector.match(/\[data-testid=["']([^"']+)["']\]/);
        if (match) {
            fieldQuery = `screen.getByTestId("${match[1]}")`;
        }
    }
    else if (selector.includes('[aria-label=')) {
        const match = selector.match(/\[aria-label=["']([^"']+)["']\]/);
        if (match) {
            fieldQuery = `screen.getByLabelText(/${match[1]}/i)`;
        }
    }
    else if (selector.includes('[name=')) {
        const match = selector.match(/\[name=["']([^"']+)["']\]/);
        if (match) {
            fieldQuery = `screen.getByRole('textbox', { name: /${match[1]}/i })`;
        }
    }
    else {
        // Try to find by label
        const labelMatch = selector.match(/label:(.+)/);
        if (labelMatch) {
            fieldQuery = `screen.getByLabelText(/${labelMatch[1]}/i)`;
        }
        else {
            fieldQuery = `screen.getByRole('textbox')`;
        }
    }
    if (step.type === 'fill') {
        return `await userEvent.type(${fieldQuery}, '${value}');`;
    }
    if (step.type === 'select') {
        return `await userEvent.selectOptions(${fieldQuery}, '${value}');`;
    }
    return '';
}
/**
 * Generate submit button click code
 */
function generateSubmitCode(step) {
    const selector = step.selector || step.target || '';
    let submitQuery = '';
    if (selector.includes('[data-testid=')) {
        const match = selector.match(/\[data-testid=["']([^"']+)["']\]/);
        if (match) {
            submitQuery = `screen.getByTestId("${match[1]}")`;
        }
    }
    else {
        // Try to find submit button
        const submitPatterns = ['submit', 'save', 'confirm', 'apply'];
        const pattern = submitPatterns.find(p => selector.toLowerCase().includes(p)) || 'submit';
        submitQuery = `screen.getByRole('button', { name: /${pattern}/i })`;
    }
    return `await userEvent.click(${submitQuery});`;
}
/**
 * Generate close dialog code
 */
function generateCloseCode(step) {
    // Try to find close button
    const closePatterns = ['close', 'cancel', 'dismiss', 'esc'];
    return `await userEvent.keyboard('{Escape}');`;
}
/**
 * Generate assertion code
 */
function generateAssertionCode(step) {
    const selector = step.selector || step.target || '';
    // Build query for assertion target
    let assertQuery = '';
    if (selector.includes('[data-testid=')) {
        const match = selector.match(/\[data-testid=["']([^"']+)["']\]/);
        if (match) {
            assertQuery = `screen.getByTestId("${match[1]}")`;
        }
    }
    else if (selector.includes('[role=')) {
        const match = selector.match(/\[role=["']([^"']+)["']\]/);
        if (match) {
            assertQuery = `screen.getByRole('${match[1]}')`;
        }
    }
    else {
        // Default to finding visible element
        assertQuery = `screen.getByText(/.+/)`;
    }
    if (step.type === 'assert') {
        return `await waitFor(() => expect(${assertQuery}).toBeInTheDocument());`;
    }
    if (step.type === 'waitForSelector') {
        return `await waitFor(() => expect(${assertQuery}).toBeInTheDocument());`;
    }
    return '';
}
/**
 * Transform a single dialog flow into test code
 */
function transformSingleFlow(flow) {
    const helpers = [];
    const testSteps = [];
    const cleanup = [];
    // Generate openDialog helper
    helpers.push({
        type: 'helper',
        code: generateOpenDialogHelper(flow),
        description: `Helper to open ${flow.type} dialog`,
    });
    // Generate test steps
    // 1. Call openDialog helper
    testSteps.push({
        type: 'action',
        code: 'await openDialog();',
        description: 'Open the dialog',
    });
    // 2. Fill form fields in order
    for (const fillStep of flow.contentSteps) {
        const fillCode = generateFillCode(fillStep);
        if (fillCode) {
            testSteps.push({
                type: 'action',
                code: fillCode,
                description: `Fill ${fillStep.type} field`,
            });
        }
    }
    // 3. Submit (if there's a click after filling)
    const lastContentStep = flow.contentSteps[flow.contentSteps.length - 1];
    if (lastContentStep && lastContentStep.type === 'fill') {
        // Generate a submit button click
        testSteps.push({
            type: 'action',
            code: "await userEvent.click(screen.getByRole('button', { name: /submit/i }));",
            description: 'Submit the dialog',
        });
    }
    // 4. Close dialog (if not already closed by submit)
    if (flow.closeStep) {
        cleanup.push({
            type: 'action',
            code: generateCloseCode(flow.closeStep),
            description: 'Close the dialog',
        });
    }
    // 5. Assertion (if present)
    if (flow.assertionStep) {
        testSteps.push({
            type: 'assertion',
            code: generateAssertionCode(flow.assertionStep),
            description: 'Verify dialog state',
        });
    }
    return { helpers, testSteps, cleanup };
}
/**
 * Transform dialog flows into optimized test code
 *
 * @param flows - Array of detected dialog flows
 * @returns Transformed steps ready for code generation
 */
export function transformDialogFlows(flows) {
    if (!flows || flows.length === 0) {
        return [];
    }
    return flows.map(transformSingleFlow);
}
/**
 * Generate complete test code from a dialog template
 */
export function generateDialogTestCode(template) {
    const lines = [];
    // Add helpers
    for (const helper of template.helpers) {
        lines.push(helper.code);
        lines.push('');
    }
    // Add test steps
    for (const step of template.testSteps) {
        lines.push(step.code);
    }
    // Add cleanup
    if (template.cleanup && template.cleanup.length > 0) {
        lines.push('');
        for (const step of template.cleanup) {
            lines.push(step.code);
        }
    }
    return lines.join('\n');
}
export default transformDialogFlows;
//# sourceMappingURL=dialog-transform.js.map