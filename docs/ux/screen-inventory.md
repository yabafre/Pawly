# Pawly — Screen Inventory

_Sharded from the original single-file UX spec during the BMAD→APED migration (2026-06-03). Companion shards: `design-spec.md`, `screen-inventory.md`, `components.md`, `flows.md`._

## Admin & Employee Direction (Operational UI)

**Purpose:** Align the Admin and Employee experiences with a calm, data-dense operational UI inspired by the latest design direction.

### Visual Tokens (Operational Layer)
*   **Primary Action:** Electric Indigo (`#4F46E5`) for planning actions and active states.
*   **Secondary Action:** Vital Orange (`#F97316`) for warnings and attention states.
*   **Validation / Medical Trust:** Vet Teal (`#009588`) remains the semantic color for validation and care.
*   **Surface:** Surgical White on Neutral Wash (`#FFFFFF` / `#FDFDFD`) with soft shadows.

### Layout & Components
*   **Top Bar:** Sticky, blurred, minimal. Brand mark in Neutral-900 and subtle notification affordances.
*   **Tab Pills:** Rounded, bold, high-contrast active state (Neutral-900) with soft shadows.
*   **Cards:** Rounded-3xl, light borders, low-contrast shadows for a clinical calm feel.
*   **Planning Grid:** Dense, structured grid with dashed separators and interactive shift chips.
*   **Employee Dashboard:** Two-up shortcut cards + "Today" focus card + upcoming list.
*   **Absence Requests:** Card-based list with emoji avatars and badge-based statuses.
*   **Login Surface:** Single centered card with tabbed auth. Logo in Neutral-900, indigo accents for interactive elements, primary CTA in Neutral-900, success state in Indigo wash.

### Motion & Feedback
*   **Micro-motion:** Subtle scale/opacity on hover. Avoid high-frequency animation.
*   **Status:** Use badges and small pulse dots for "today" or "action required" states.

---

## Vision Mockups Reference

**Note:** A React-based vision mockup exists demonstrating the Admin Planning Grid, Employee Dashboard, and Absence Request flows. This mockup serves as a **visual direction reference** (not a final implementation). Key components demonstrated:

### Admin View (Desktop)
- **Planning Grid:** Staff rows × Day columns with ShiftCell components (CHIR, ACC, OFF, ECOLE, VAC)
- **Tab Navigation:** Dashboard | Planning | Requests with pill-style buttons
- **Auto-Generate Button:** Primary CTA with sparkle icon for algorithm trigger

### Employee View (Mobile)
- **Today Card:** Current shift with confirmation action (Check icon → CheckCircle2 on confirm)
- **Stats Card:** Weekly hours progress with visual bar
- **Absence Request Shortcut:** Dashed card CTA to request flow
- **Upcoming List:** Next days preview with shift type icons and status badges

### Absence Request Flow
- **Type Selection:** Grid of 4 types (Leave, Sick, School, Child) with icons
- **Date Selection:** Calendar-based picker
- **Submit CTA:** Full-width primary button

### Brand System
- **Logo:** PawPrint icon in Neutral-900 square (rounded-xl)
- **App Name:** "Pawly" (extrabold, tracking-tight)
- **Design System:** "Clean Care" v1.1 aligned with "Clinique Zen" principles

