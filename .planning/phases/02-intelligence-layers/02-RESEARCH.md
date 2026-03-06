# Phase 02: Intelligence Layers - Research

**Researched:** 2026-03-06
**Domain:** Recording Intelligence (Noise Filtering, Visual Inspection, Mock Detection, Dialog Flow Detection)
**Confidence:** HIGH

## Summary

Phase 02 focuses on making generated tests "smarter" by filtering noise from recordings, enabling visual UI inspection, detecting API mocks, and grouping multi-step dialog flows. This research covers the four sub-areas defined in the execution plans: (1) noise filtering/deduplication, (2) visual intelligence with Playwright, (3) mock intelligence with MSW, and (4) dialog flow detection.

The standard approach for Chrome Recorder intelligence involves filtering redundant events at the parser level before test generation. Playwright provides the industry-standard browser automation API for visual inspection. MSW 2.x is the current standard for API mocking in React Testing Library tests. Dialog detection relies on heuristic pattern matching on DOM structure and user interaction timing.

**Primary recommendation:** Implement 02-01 first (noise filtering), then 02-02 (visual), 02-03 (mocks), and 02-04 (dialogs) last since it depends on deduplication.

---

## Standard Stack

### Core Intelligence Libraries

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | 1.50.x | Browser automation for UI inspection | Cross-browser support, Microsoft-maintained, active development |
| MSW | 2.x | API mocking for tests | Industry standard for REST/GraphQL mocking, modern ESM-first |
| @testing-library/dom | 10.x | DOM query APIs | Underlies RTL, needed for selector strategy patterns |
| user-event | 14.x | User interaction simulation | Recommended by Testing Library for realistic user events |

### Noise Filtering & Deduplication

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (custom) | - | Click deduplication | Always - removes rapid duplicate clicks |
| (custom) | - | Noise filtering | Always - removes dblClick, cursor, accidental scroll |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | 1.x | Terminal colors | CLI output formatting |
| zod | 3.24.x | Schema validation | Validating Chrome Recorder JSON |

**Installation:**

```bash
# Core runtime
npm install playwright@1 msw@2 @testing-library/dom@10 user-event@14

# Development
npm install -D zod@3 picocolors@1
```

---

## Architecture Patterns

### Recommended Project Structure for Intelligence Layer

```
src/
├── parser/
│   ├── recorder-parser.ts      # Main parser orchestration
│   ├── steps/
│   │   ├── deduplicator.ts     # Click deduplication (02-01)
│   │   ├── noise-filter.ts     # Noise event filtering (02-01)
│   │   └── dialog-detector.ts  # Dialog flow detection (02-04)
│   └── types.ts                # RecordingStep types
├── analyzer/
│   ├── visual/
│   │   ├── inspector.ts        # Playwright browser control (02-02)
│   │   └── element-analyzer.ts # Accessibility property extraction (02-02)
│   └── mocks/
│       ├── detector.ts         # API call detection (02-03)
│       └── target-analyzer.ts  # Mock target identification (02-03)
├── generator/
│   ├── transforms/
│   │   └── dialog-transform.ts # Dialog flow to test code (02-04)
│   └── mocks/
│       └── builder.ts          # Mock code generation (02-03)
└── core/
    └── orchestrator.ts         # Pipeline coordination
```

### Pattern 1: Click Deduplication

**What:** Detect and consolidate rapid clicks on the same element
**When to use:** Chrome Recorder exports with multiple clicks on buttons/links
**Algorithm:** Time-window based deduplication (500ms threshold)

```typescript
// Source: Pattern from Chrome Recorder behavior analysis
interface RecordingStep {
  type: 'click' | 'fill' | 'navigate' | 'assert' | 'scroll';
  selector?: string;
  value?: string;
  timestamp: number;
}

function deduplicateSteps(steps: RecordingStep[]): RecordingStep[] {
  const result: RecordingStep[] = [];
  const seen = new Map<string, RecordingStep>();
  
  for (const step of steps) {
    if (step.type !== 'click' || !step.selector) {
      result.push(step);
      continue;
    }
    
    const key = `${step.selector}`;
    const lastSeen = seen.get(key);
    
    // If same selector clicked within 500ms, skip this one
    if (lastSeen && step.timestamp - lastSeen.timestamp < 500) {
      continue;
    }
    
    seen.set(key, step);
    result.push(step);
  }
  
  return result;
}
```

### Pattern 2: Noise Event Filtering

**What:** Remove irrelevant events that don't contribute to test meaning
**When to use:** Before test generation, after deduplication

**Events to Filter:**
- `dblClick` - Usually accidental, single click is sufficient
- `mousemove` / `mouseover` / `mouseout` - Cursor wandering, no action
- `scroll` - Only filter if no user action within 2s after scroll

**Events to Preserve:**
- `click`, `fill`, `select`, `change` - User actions
- `navigate` - URL changes
- `keyPress` - Keyboard input
- `assert` - Verification steps

```typescript
// Source: Common recording noise patterns
function filterNoiseSteps(steps: RecordingStep[]): RecordingStep[] {
  const result: RecordingStep[] = [];
  let lastActionIndex = -1;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // Always filter dblClick
    if (step.type === 'dblClick') continue;
    
    // Filter cursor movement events
    if (['mousemove', 'mouseover', 'mouseout'].includes(step.type)) continue;
    
    // Filter accidental scroll (scroll with no action within 2s)
    if (step.type === 'scroll') {
      const hasSubsequentAction = steps
        .slice(i + 1, i + 20) // Check next 20 steps (~2s at 10/sec)
        . stepssome(s => ['click', 'fill', 'navigate'].includes(s.type));
      
      if (!hasSubsequentAction) continue;
    }
    
    result.push(step);
', 'navigateclick', 'fill'].includes(step.type)) {
      last    if (['ActionIndex = result.length - 1;
    }
  }
  
  return result;
}
```

### Pattern 3 Inspection

**What: Playwright Element:** Launch browser to URL, navigate, extract accessibility properties
**When to use:** Whenvisual flag is enabled --, for complex UI states

```typescript
// Source: Playwright API (play/class-page)
importwright.dev/docs/api, Page } { chromium, Browser from 'playwright';

interface ElementInfo {
  tagName: string;
 ;
  ariaRole textContent: string?: string;
  ariaLabel?: string;
  nameAttr?: string;
  id: string;
  classes: string[];
  isVisible: boolean;
  isDisabled: boolean;
}

async function inspectElement(page: Page, selector: string): Promise<ElementInfo | null> {
  const element$(selector);
  = await page. if (!element) return null;
  
  return await element.evaluate((el: Element): ElementInfo => {
    return {
      tagName: el.tagName.toLowerCase(),
      textContent: el.textContent?.trim() || '',
      ariaRole: el.getAttribute('role') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      nameAttr: (el as HTMLInputElement).name || 
                el.getAttribute('aria-labelledby') || undefined,
      id: el.id,
      classes: el.className.split(' ').filter(Boolean),
      isVisible: el instanceof HTMLElement && 
                 getComputedStyle(el).display !== 'none',
      isDisabled: (el as HTMLButtonElement).disabled ||
                  el.getAttribute('aria-disabled') === 'true',
    };
  });
}
```

### Pattern 4: Query Strategy Ranking

**What:** Rank RTL queries by robustness for element selection
**When to use:** When generating test code, for optimal selector generation

**Priority Order (most to least robust):**
1. `getByRole` + name (most accessible)
2. `getByLabelText` (form fields)
3. `getByPlaceholderText`
4. `getByAltText` (images)
5. `getByTestId` (explicit test IDs)
6. `getByText` (last resort)

```typescript
// Source: Testing Library guiding principles
interface QueryStrategy {
  method: string;
  args: (string | RegExp)[];
  priority: number; // 1 = best
}

function rankQueryStrategies(element: ElementInfo): QueryStrategy[] {
  const strategies: QueryStrategy[] = [];
  
  // 1. getByRole - highest priority
  if (element.ariaRole) {
    strategies.push({
      method: 'getByRole',
      args: [element.ariaRole, { name: element.ariaLabel || element.textContent }],
      priority: 1,
    });
  }
  
  // 2. getByLabelText - for form elements
  if (['input', 'select', 'textarea'].includes(element.tagName)) {
    strategies.push({
      method: 'getByLabelText',
      args: [element.nameAttr || /.*/],
      priority: 2,
    });
  }
  
  // 3. getByPlaceholderText
  if (element.tagName === 'input') {
    strategies.push({
      method: 'getByPlaceholderText',
      args: [element.nameAttr || /.*/],
      priority: 3,
    });
  }
  
  // 4. getByAltText - for images
  if (element.tagName === 'img') {
    strategies.push({
      method: 'getByAltText',
      args: [element.textContent],
      priority: 4,
    });
  }
  
  // 5. getByTestId - if data-testid present
  const testId = element.getAttribute?.('data-testid');
  if (testId) {
    strategies.push({
      method: 'getByTestId',
      args: [testId],
      priority: 5,
    });
  }
  
  // 6. getByText - last resort
  if (element.textContent) {
    strategies.push({
      method: 'getByText',
      args: [element.textContent],
      priority: 6,
    });
  }
  
  return strategies.sort((a, b) => a.priority - b.priority);
}
```

### Pattern 5: MSW Mock Generation

**What:** Generate MSW handlers from detected API calls
**When to use:** When recordings contain API interactions

```typescript
// Source: MSW 2.x documentation (mswjs.io/docs/getting-started)
import { http, HttpResponse } from 'msw';

interface ApiCallInfo {
  stepIndex: number;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  requestBody?: any;
  responseType?: 'json' | 'html' | 'text';
}

function buildMswHandler(call: ApiCallInfo): string {
  const method = call.method.toLowerCase();
  
  return `http.${method}('${call.url}', () => {
  return HttpResponse.json({
    // TODO: Add response data from recording
  });
})`;
}

// Usage in test file
const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'John' }
    ]);
  }),
  http.post('/api/users', () => {
    return HttpResponse.json({ id: 2, name: 'New User' }, { status: 201 });
  }),
];
```

### Pattern 6: Dialog Flow Detection

**What:** Group multi-step dialog interactions into logical units
**When to use:** When recordings contain modal/drawer interactions

```typescript
// Source: Common dialog patterns in web apps
interface DialogFlow {
  id: string;
  type: 'modal' | 'drawer' | 'popover' | 'confirm' | 'form';
  triggerStep: RecordingStep;
  contentSteps: RecordingStep[];
  closeStep?: RecordingStep;
  assertionStep?: RecordingStep;
}

function groupDialogSteps(steps: RecordingStep[]): DialogFlow[] {
  const flows: DialogFlow[] = [];
  let currentFlow: DialogFlow | null = null;
  
  for (const step of steps) {
    // Dialog open: click on trigger element
    if (step.type === 'click' && isDialogTrigger(step.selector)) {
      if (currentFlow) flows.push(currentFlow);
      currentFlow = {
        id: `dialog-${flows.length + 1}`,
        type: detectDialogType(step.selector),
        triggerStep: step,
        contentSteps: [],
      };
      continue;
    }
    
    // Dialog close: click on close button, ESC key, or click outside
    if (currentFlow && isDialogClose(step)) {
      currentFlow.closeStep = step;
      flows.push(currentFlow);
      currentFlow = null;
      continue;
    }
    
    // Content steps within dialog
    if (currentFlow) {
      currentFlow.contentSteps.push(step);
    } else {
      if (currentFlow) flows.push(currentFlow);
      flows.push({
        id: `standalone-${flows.length + 1}`,
        type: 'form',
        triggerStep: step,
        contentSteps: [step],
      });
    }
  }
  
  if (currentFlow) flows.push(currentFlow);
  return flows;
}

function isDialogTrigger(selector?: string): boolean {
  if (!selector) return false;
  return /modal|dialog|drawer|popup|open/i.test(selector);
}

function isDialogClose(step: RecordingStep): boolean {
  if (step.type === 'click') {
    return /close|cancel|backdrop|overlay/i.test(step.selector || '');
  }
  if (step.type === 'keyPress' && step.value === 'Escape') {
    return true;
  }
  return false;
}
```

---

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Click deduplication | Custom deduplication logic | Time-window algorithm (500ms) | Standard pattern from recorder analysis |
| Noise filtering | Build from scratch | Filter dblClick, mousemove, accidental scroll | Established noise patterns |
| Browser automation | Build custom solution | Playwright | Cross-browser, well-maintained, active development |
| API mocking | Create custom mock server | MSW 2.x | Industry standard, ESM-first, great DX |
| Dialog detection | Guess dialog patterns | Heuristic detection with aria roles | Use dialog, alertdialog roles |
| Query selection | Random selector strategy | Priority-based ranking (getByRole first) | Testing Library best practices |

**Key insight:** In this domain, the "standard" is well-established through Testing Library and Playwright ecosystems. Don't reinvent browser automation or mocking - leverage existing battle-tested libraries.

---

## Common Pitfalls

### Pitfall 1: Filtering Too Aggressively

**What goes wrong:** Legitimate rapid clicks filtered as duplicates
**Why it happens:** Threshold too short (e.g., 100ms), not checking selector uniqueness
**How to avoid:** Use 500ms window, only filter exact same selector matches
**Warning signs:** Tests missing expected actions, buttons not clicked in output

### Pitfall 2: Visual Inspection Without Cleanup

**What goes wrong:** Browser processes accumulate, memory leaks
**Why it happens:** Not calling browser.close() in all code paths
**How to avoid:** Use try/finally with browser cleanup, or use context manager pattern
**Warning signs:** Multiple browser processes visible in system monitor

### Pitfall 3: Mock Generation Without Response Data

**What goes wrong:** Generated mocks return empty objects, tests fail
**Why it happens:** Not capturing response data from recording
**How to avoid:** If no response captured, generate with TODO comments for manual completion
**Warning signs:** Tests fail with "expected object, got empty"

### Pitfall 4: Dialog Detection False Positives

**What goes wrong:** Non-dialog clicks grouped as dialog flow
**Why it happens:** Overly broad trigger detection patterns
**How to avoid:** Require aria role or explicit dialog markers
**Warning signs:** Single clicks grouped into "dialogs", test structure broken

### Pitfall 5: Query Priority Mismatch

**What goes wrong:** Generated tests use fragile queries that break easily
**Why it happens:** Not following Testing Library query priority
**How to avoid:** Always prefer getByRole, then getByLabelText, then others
**Warning signs:** Tests fail when UI text changes slightly

---

## Code Examples

### Complete Pipeline Integration (02-01)

```typescript
// Source: Integration pattern from ARCHITECTURE.md
import { deduplicateSteps } from './steps/deduplicator';
import { filterNoiseSteps } from './steps/noise-filter';

async function parseRecording(json: ChromeRecorderExport): Promise<NormalizedStep[]> {
  // 1. Parse JSON to normalized steps
  let steps = parseJsonToSteps(json);
  
  // 2. Deduplicate rapid clicks
  steps = deduplicateSteps(steps);
  
  // 3. Filter noise events
  steps = filterNoiseSteps(steps);
  
  return steps;
}
```

### Playwright Visual Inspection (02-02)

```typescript
// Source: Playwright best practices
import { chromium, Browser, BrowserContext, Page } from 'playwright';

async function inspectWithPlaywright(
  url: string,
  selectors: string[]
): Promise<Map<string, ElementInfo>> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    
    const results = new Map<string, ElementInfo>();
    for (const selector of selectors) {
      const info = await inspectElement(page, selector);
      if (info) results.set(selector, info);
    }
    return results;
  } finally {
    await browser.close();
  }
}
```

### MSW Mock Builder (02-03)

```typescript
// Source: MSW 2.x patterns
import { http, HttpResponse } from 'msw';

function generateMockCode(calls: ApiCallInfo[]): string {
  const handlers = calls.map(call => {
    const method = call.method.toLowerCase();
    return `  http.${method}('${call.url}', () => {
    return HttpResponse.json({
      // TODO: Add response data captured during recording
    });
  })`;
  }).join(',\n');
  
  return `import { http, HttpResponse } from 'msw';

export const handlers = [
${handlers}
];`;
}
```

### Dialog Transform (02-04)

```typescript
// Source: Dialog testing best practices
function transformDialogFlows(flows: DialogFlow[]): string {
  return flows.map(flow => {
    const helperName = `open${capitalize(flow.type)}`;
    
    return `const ${helperName} = async () => {
  await userEvent.click(screen.getByRole('button', { name: /${getTriggerName(flow)}/i }));
  await waitFor(() => expect(screen.getByRole('${flow.type}')).toBeInTheDocument());
};

test('${flow.type} interaction', async () => {
  await ${helperName}();
${flow.contentSteps.map(s => `  await ${stepToAction(s)}`).join('\n')}
});`;
  }).join('\n\n');
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Puppeteer | Playwright | 2020+ | Cross-browser, better API |
| sinon.js | MSW 2.x | 2022+ | Native ESM, better TypeScript |
| string selectors | getByRole queries | 2018+ | Accessible, robust tests |
| manual mock creation | auto-generated mocks | 2020+ | Less boilerplate |
| linear test steps | grouped dialog flows | 2021+ | More readable tests |

**Deprecated/outdated:**
- `enzyme` - React Testing Library is now standard
- `shallow` rendering - Testing Library promotes full DOM
- `jest.mock` for everything - MSW is more flexible for APIs
- CSS selectors in tests - Use semantic queries instead

---

## Open Questions

1. **Dialog Type Detection Accuracy**
   - What we know: Dialogs have specific ARIA roles (dialog, alertdialog)
   - What's unclear: How to reliably distinguish modal from drawer without visual inspection
   - Recommendation: Require aria role or explicit selector patterns for high confidence

2. **Mock Response Extraction**
   - What we know: Chrome Recorder doesn't capture network responses by default
   - What's unclear: How to get response data - requires recording extension or manual addition
   - Recommendation: Generate TODO placeholders when response not available

3. **Scroll Noise Detection Window**
   - What we know: 2s window is common heuristic
   - What's unclear: Optimal window size varies by app
   - Recommendation: Make configurable via CLI flag

---

## Sources

### Primary (HIGH confidence)
- Playwright API documentation - https://playwright.dev/docs/api/class-page
- MSW 2.x documentation - https://mswjs.io/docs/getting-started
- Testing Library query docs - https://testing-library.com/docs/queries/byrole
- Chrome Recorder documentation - https://developer.chrome.com/docs/devtools/recorder

### Secondary (MEDIUM confidence)
- Community patterns for noise filtering in recorder exports
- Dialog detection heuristics from UI testing frameworks

### Tertiary (LOW confidence)
- Various blog posts on test generation (need verification)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries well-established and documented
- Architecture: HIGH - Patterns derived from official docs and testing best practices
- Pitfalls: MEDIUM - Based on common issues, not project-specific

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (30 days for stable stack, libraries update quarterly)
