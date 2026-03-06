# Architecture Research

**Domain:** Test Generation Tool (Chrome Recorder to React Testing Library)
**Researched:** 2026-03-06
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI Interface Layer                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      Taro Orchestrator                          ││
│  │   (Coordinates all components, manages flow)                    ││
│  └─────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│                         Core Processing Layer                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│
│  │   Parser    │  │  Analyzer   │  │  Generator  │  │   Writer    ││
│  │             │→ │             │→ │             │→ │             ││
│  │ (Recorder   │  │ (Codebase   │  │ (Template  │  │ (File       ││
│  │  JSON)      │  │  Introspection)│  │  Engine)   │  │  Operations)│
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│                         Data/State Layer                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │Convention   │  │  Project    │  │  Learning   │                  │
│  │ Store       │  │  Context    │  │  Store      │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **CLI Interface** | User input handling, command routing | Commander.js/oclif CLI |
| **Orchestrator** | Coordinate pipeline, manage errors, report progress | Main async pipeline controller |
| **Parser** | Parse Chrome Recorder JSON, validate schema | Zod/JSON Schema validation |
| **Analyzer** | Inspect codebase, extract component metadata, find test patterns | AST parsing (TypeScript) |
| **Generator** | Transform parsed steps to RTL test code | Template engine (Handlebars/mustache) + AST generation |
| **Writer** | Create/update test files, ensure colocated placement | Node.js fs operations |
| **Convention Store** | Persist learned project conventions | JSON file or SQLite |
| **Project Context** | Current project configuration, paths | In-memory + config files |
| **Learning Store** | Remember selector preferences, custom patterns | JSON/File-based persistence |

## Recommended Project Structure

```
src/
├── cli/                      # CLI entry point and commands
│   ├── index.ts              # CLI setup
│   └── commands/
│       ├── generate.ts        # Main generate command
│       └── init.ts            # Initialize convention learning
├── core/                     # Core orchestration
│   ├── orchestrator.ts       # Pipeline coordinator
│   ├── pipeline.ts           # Processing pipeline definitions
│   └── errors.ts             # Custom error types
├── parser/                   # Chrome Recorder JSON parsing
│   ├── recorder-parser.ts    # Main parser
│   ├── schema.ts             # JSON schema validation
│   ├── types.ts              # Internal types
│   └── steps/
│       ├── click.ts          # Step type parsers
│       ├── type.ts
│       ├── navigate.ts
│       └── wait.ts
├── analyzer/                 # Codebase analysis
│   ├── analyzer.ts           # Main analyzer
│   ├── components/
│   │   ├── finder.ts         # Find component files
│   │   ├── extractor.ts     # Extract component metadata
│   │   └── selectors.ts      # Analyze existing test selectors
│   ├── ast/                  # AST utilities
│   │   ├── parser.ts         # TypeScript AST parser
│   │   └── visitors.ts       # Custom AST visitors
│  
│   └── conventions/
│       ├── detector.ts       # Detect project conventions
│       └── patterns.ts       # Common patterns inventory
├── generator/                # Test code generation
│   ├── generator.ts          # Main generator
│   ├── templates/            # Test templates
│   │   ├── basic-test.ts     # Basic test template
│   │   ├── component-test.ts # Component test template
│   │   └── mock-template.ts  # Mock helper templates
│   ├── transforms/           # Step-to-query transforms
│   │   ├── selectors.ts      # Selector strategies
│   │   ├── assertions.ts     # Assertion builders
│   │   └── waits.ts          # Wait/async handling
│   └── codegen/
│       ├── ast-builder.ts    # AST-based code generation
│       └── printer.ts        # Code formatting
├── writer/                   # File operations
│   ├── writer.ts             # Main file writer
│   ├── file-operations.ts    # Create/update files
│   ├── path-resolver.ts      # Resolve colocated paths
│   └── test-finder.ts        # Find existing test files
├── store/                    # State management
│   ├── convention-store.ts   # Convention persistence
│   ├── learning-store.ts      # Learning state
│   └── project-context.ts    # Current project state
├── config/                   # Configuration
│   ├── config.ts             # Config loading
│   └── defaults.ts           # Default settings
└── utils/                    # Shared utilities
    ├── logger.ts             # Logging utilities
    └── path.ts               # Path utilities
```

### Structure Rationale

- **cli/**: Separates CLI concerns from core logic, enables testing without CLI
- **parser/**: Isolates input parsing, easy to swap for different export formats
- **analyzer/**: Independent codebase introspection, reusable for multiple outputs
- **generator/**: Template-based generation allows customization without core changes
- **writer/**: File operations isolated for testability and different output targets
- **store/**: State persistence separate from processing, enables incremental learning
- **core/**: Minimal orchestrator that coordinates, doesn't contain domain logic

## Architectural Patterns

### Pattern 1: Pipeline Architecture

**What:** Sequential processing stages where each stage transforms input and passes to next
**When to use:** Core processing flow where data flows linearly
**Trade-offs:** Simple to understand and test, but less flexible for branching logic

**Example:**
```typescript
async function runPipeline(input: RecorderExport): Promise<TestFile[]> {
  const parsed = await parser.parse(input);
  const context = await analyzer.analyze(parsed, projectPath);
  const generated = await generator.generate(parsed, context);
  return await writer.write(generated);
}
```

### Pattern 2: Convention Learning

**What:** Build and persist understanding of project-specific patterns over time
**When to use:** When generated tests need to match project conventions
**Trade-offs:** Improves over time but requires initial warm-up period

**Example:**
```typescript
class ConventionStore {
  async learn(analysis: CodeAnalysis): Promise<void> {
    const conventions = detectConventions(analysis);
    await this.store.merge(conventions);
  }
  
  async getConventions(): Promise<Conventions> {
    return this.store.get() ?? DEFAULT_CONVENTIONS;
  }
}
```

### Pattern 3: Selector Strategy Pattern

**What:** Multiple selector generation strategies with priority ordering
**When to use:** Converting Recorder selectors to RTL queries
**Trade-offs:** More flexible but requires careful priority management

**Example:**
```typescript
interface SelectorStrategy {
  priority: number;
  canHandle(step: Step): boolean;
  generate(step: Step, context: AnalysisContext): string[];
}

const strategies: SelectorStrategy[] = [
  new AriaRoleStrategy(),      // Highest priority
  new TestIdStrategy(),        // Project-specific IDs
  new TextContentStrategy(),   // Fallback
  new StructuralStrategy(),    // Last resort
];
```

### Pattern 4: Colocated Test Placement

**What:** Place generated tests next to their components using file system conventions
**When to use:** When following project conventions for test location
**Trade-offs:** Matches project patterns but requires flexible path resolution

**Example:**
```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx    ← Generated here
│   │   └── index.ts
```

## Data Flow

### Main Processing Flow

```
[Chrome Recorder JSON]
         ↓
[Parser: Validate & Normalize]
         ↓
[Recorder Steps Data]
         ↓
[Analyzer: Inspect Codebase]
         ↓
[Analysis Context + Conventions]
         ↓
[Generator: Transform to RTL]
         ↓
[Generated Test Code]
         ↓
[Writer: Create Files]
         ↓
[Test Files on Disk]
```

### Convention Learning Flow

```
[Code Analysis]
    ↓
[Convention Detector]
    ↓
[New Conventions]
    ↓
[Convention Store] ←→ [Learning Store]
    ↓
[Generator Uses Conventions]
```

### Key Data Flows

1. **Generation Flow:** Recorder JSON → Parser → Analyzer → Generator → Writer
2. **Learning Flow:** Codebase changes → Analyzer → Convention Store → Future generations
3. **Configuration Flow:** CLI args + config files → Project Context → All components

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single project | Monolith architecture, file-based store |
| Multiple projects | Add project isolation, shared convention database |
| Team/Organization | Centralized convention server, configuration management |
| 100+ projects | Consider microservices, shared convention learning |

### Scaling Priorities

1. **First bottleneck:** Analyzer performance on large codebases
   - **Fix:** Add caching, incremental analysis, parallel processing
   
2. **Second bottleneck:** Convention store read/write
   - **Fix:** In-memory cache with file persistence, eventually move to database

3. **Third bottleneck:** Template rendering for many test files
   - **Fix:** Template caching, batch processing

## Anti-Patterns

### Anti-Pattern 1: Monolithic Generator

**What people do:** Put all generation logic in one large function or class
**Why it's wrong:** Hard to test, difficult to extend, becomes unmaintainable
**Do this instead:** Use Strategy pattern for different step types, separate templates per test style

### Anti-Pattern 2: Tight Coupling to Chrome Recorder Schema

**What people do:** Directly use Recorder JSON structure throughout the system
**Why it's wrong:** Recorder format may change, hard to support other input formats
**Do this instead:** Normalize to internal representation early, isolate parser

### Anti-Pattern 3: Ignoring Project Conventions

**What people do:** Generate generic tests without analyzing project patterns
**Why it's wrong:** Generated tests won't match project style, developers will rewrite them
**Do this instead:** Build convention detection and learning from the start

### Anti-Pattern 4: No Incremental Learning

**What people do:** Analyze codebase from scratch every time
**Why it's wrong:** Slow for large projects, doesn't improve over time
**Do this instead:** Cache analysis results, persist learned conventions

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Chrome Recorder | JSON file import | Standard export format, well-documented |
| File System | Node.js fs APIs | Primary output target |
| TypeScript AST | ts-morph or @typescript-eslint/parser | Codebase analysis |
| Testing Library | Template output | Target for generated tests |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Parser ↔ Analyzer | Internal step types | Parser normalizes, analyzer understands |
| Analyzer ↔ Generator | Analysis context | Shared data structure for context |
| Generator ↔ Writer | Test file AST | Structured output, not just strings |
| All ↔ Store | Convention objects | Shared learning state |

## Build Order Implications

Based on dependencies, implement in this order:

1. **Phase 1: Parser** (no dependencies)
   - Parse Chrome Recorder JSON
   - Validate against schema
   - Output: Normalized step objects

2. **Phase 2: Writer** (no dependencies)
   - File system operations
   - Path resolution
   - Test file creation

3. **Phase 3: Generator** (depends on Parser)
   - Template engine
   - Step-to-query transforms
   - Basic test output

4. **Phase 4: Analyzer** (independent but needed for Phase 5)
   - Codebase inspection
   - Convention detection
   - AST parsing

5. **Phase 5: Convention Store** (supports Analyzer/Generator)
   - Persistence layer
   - Learning logic

6. **Phase 6: Orchestrator** (coordinates all)
   - Pipeline definition
   - Error handling
   - Progress reporting

7. **Phase 7: CLI** (depends on all)
   - Command interface
   - Configuration handling

This ordering ensures each component can be tested independently before integration.

## Sources

- Chrome DevTools Recorder documentation (developer.chrome.com/docs/devtools/recorder)
- Testing Library guiding principles (testing-library.com/docs)
- Kent C. Dodds on testing implementation details
- Common React project testing conventions (community patterns)
- Pipeline architecture patterns from code generation tools

---

*Architecture research for: Test Generation Tool (Chrome Recorder to RTL)*
*Researched: 2026-03-06*
