# Pawly — UX Flows

_Sharded from the original single-file UX spec during the BMAD→APED migration (2026-06-03). Companion shards: `design-spec.md`, `screen-inventory.md`, `components.md`, `flows.md`._

## User Journey Flows

### 1. Admin: The Planning Generation Loop (Tetris)
The strategic flow of creating a valid schedule from chaos.
**Key Principle:** *Transparency over Magic* - The system explains its steps during generation and its constraints during refinement.

```mermaid
graph TD
    A[Start: Empty Month View] --> B{Template Exists?}
    B -- No --> C[System Proposes Template]
    B -- Yes --> D[Apply Template]
    C --> D
    D --> E[Click 'Generate']
    E --> F[Progress State: 1. Template / 2. Constraints / 3. Auto-fill]
    F --> G{Blocking Errors?}
    G -- Yes --> H[Display 'Hard Rule' Modals]
    H --> I[Admin Fixes Constraints]
    I --> E
    G -- No --> J[Render Proposed Schedule]
    J --> K[Manual Refinement Loop]
    K --> L{Drag & Drop Shift}
    L --> M{Valid Move?}
    M -- Valid --> N[Update Grid + Health Bar]
    M -- Invalid --> O[Snap Back + Show Toast Reason]
    N --> P{Health Bar Green?}
    P -- No --> K
    P -- Yes --> Q[Click 'Publish']
    Q --> R[Send Notifications via BullMQ]
    R --> S[End: Published State]
```

### 2. Employee: The "Declarative Trust" Loop
The daily routine of confirming presence without friction.
**Key Principle:** *One-Thumb Flow* - Designed for mobile usage in the "Thumb Zone."

```mermaid
graph TD
    AA[Start: Open PWA via Magic Link] --> AB[Dashboard: 'Today' Card]
    AB --> AC{Shift Today?}
    AC -- No --> AD[View 'Next Shift']
    AC -- Yes --> AE{Variance?}
    AE -- No --> AF[Swipe Slider: 'I was here']
    AF --> AG[Success Animation]
    AE -- Yes --> AH[Click 'Modify / Exception']
    AH --> AI[Form: Reason + Note + Time]
    AI --> AJ[Submit Exception]
    AJ --> AK[Log to 'Variance Review']
    AK --> AG
    AG --> AL[End: Shift Validated]
```

### Journey Patterns
*   **Progressive Disclosure:** Complex forms (Variance) are hidden behind simple binary choices (Slider vs "Modify").
*   **Optimistic UI:** Drag & Drop actions update the grid immediately. If the server rejects the move (rare), it snaps back with an error toast.
*   **State-Based Navigation:** The Admin view changes context based on the "Planning State" (Draft -> Generating -> Refinement -> Published).

### Flow Optimization Principles
*   **Trust Indicators:** The Admin generation flow uses a "3-Step Progress" visualization to explain the delay and reinforce that the system is *working*, not stuck.
*   **Asynchronous Review:** Employee exceptions do not block the flow; they are logged for later Admin review, decoupling the daily action from the management approval.

