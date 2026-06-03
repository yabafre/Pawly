# Pawly — UX Components

_Sharded from the original single-file UX spec during the BMAD→APED migration (2026-06-03). Companion shards: `design-spec.md`, `screen-inventory.md`, `components.md`, `flows.md`._

## Component Strategy

### Design System Components
We leverage **shadcn/ui** for all primitives to ensure speed and accessibility.
*   **Forms:** Input, Select, Switch, Slider (crucial for mobile confirmation).
*   **Feedback:** Toast (crucial for "System Never Lies" feedback), Dialog, Alert.
*   **Layout:** Card, Separator, Badge.

### Custom Components

#### 1. The Staff-Grid (Admin)
**Purpose:** The central "Tetris board" for schedule negotiation.
**Anatomy:**
*   **Grid Container:** CSS Grid layout (Rows = Staff, Cols = Days).
*   **Cell Types:**
    *   *Shift Chip:* Draggable, colored by shift type (Consultation, Surgery).
    *   *Absence Block:* Full-cell fill (Purple/School, Orange/Sick).
    *   *Hole:* Dashed outline with "+" icon (Interactive drop target).
    *   *Day Off:* Grey hatched pattern.
**States:**
*   *Idle:* Read-only view.
*   *Dragging:* Source opacity 50%, Ghost attached to cursor.
*   *Drop Target:* Valid (Green glow), Warning (Orange glow), Blocked (Red shake).
**Accessibility:** Keyboard navigation arrows to move focus between cells. "Enter" to pick up, arrows to move, "Enter" to drop.

#### 2. The Health Bar (Admin)
**Purpose:** Global status feedback loop. Gamifies the "validity" of the schedule.
**Anatomy:**
*   **Segmented Bar:** Colored segments representing the % of valid shifts vs. holes/conflicts.
*   **Summary Label:** Text readout (e.g., "3 Conflicts, 90% Ready").
**States:**
*   *Critical:* Red segments present (Blocking errors). Publish disabled.
*   *Warning:* Orange segments present (Soft rules). Publish enabled but cautioned.
*   *Healthy:* All Teal/Green. "Publish" button pulses.

#### 3. Declarative Shift Card (Employee)
**Purpose:** Unified surface for "Knowing" and "Acting."
**Anatomy:**
*   **Header:** Date + Time (Large typography).
*   **Action Area:**
    *   *Standard:* "Swipe to Confirm" slider (Green).
    *   *Exception:* "Modify" button (Text link) opens Exception Dialog.
**States:**
*   *Future:* Read-only.
*   *Active (Today):* Actionable (Slider unlocked).
*   *Validated:* Green checkmark + "Confirmed" badge.
*   *Exception:* Orange badge "Under Review."

### Component Implementation Strategy
*   **Composition:** Custom components will be composed of shadcn primitives where possible (e.g., The Shift Card is a `Card` containing a `Slider`).
*   **Tech:**
    *   **Staff-Grid:** `CSS Grid` for layout + `dnd-kit` for accessible drag-and-drop.
    *   **Health Bar:** `framer-motion` for smooth layout transitions between states.

### Implementation Roadmap
*   **Phase 1 (Core):** Staff-Grid (Read-only rendering) + Employee Shift Card (Basic view).
*   **Phase 2 (Interaction):** Staff-Grid (Drag & Drop logic) + Employee "Swipe" action.
*   **Phase 3 (Polish):** Health Bar animations + Advanced Keyboard support for Grid.

## Visual Patterns & Micro-Copy Reference

This section provides implementation-ready visual specifications extracted from the design system and vision mockups.

### Shift Type Visual Patterns

| Shift Code | Label | Hours | Color Class | Icon |
|------------|-------|-------|-------------|------|
| `CHIR` | Surgery | 8:30am - 6:30pm | `bg-indigo-50 border-indigo-100 text-indigo-700` | `Briefcase` |
| `ACC` | Reception | 9:00am - 7:30pm | `bg-orange-50 border-orange-100 text-orange-700` | `Users` |
| `OFF` | Day Off | - | `bg-white border-neutral-100 text-neutral-300` | `Palmtree` |
| `FORM`/`SCHOOL` | Training/School | School | `bg-neutral-100 border-neutral-200 text-neutral-600` | `GraduationCap` |
| `SICK` | Sick Leave | - | `bg-rose-50 border-rose-100 text-rose-700` | `Thermometer` |
| `VAC` | Vacation | - | `bg-emerald-50 border-emerald-100 text-emerald-700` | `Plane` |

### Badge Component Patterns

```css
/* Base Badge Style */
.badge {
  padding: 6px 12px; /* px-3 py-1.5 */
  border-radius: 9999px; /* rounded-full */
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em; /* tracking-wide */
  text-transform: uppercase;
}

/* Badge Color Variants */
.badge-neutral { background: #F5F5F5; color: #525252; }
.badge-indigo { background: #EEF2FF; color: #4338CA; }
.badge-orange { background: #FFF7ED; color: #C2410C; }
.badge-emerald { background: #ECFDF5; color: #047857; }
.badge-rose { background: #FFF1F2; color: #BE123C; }
```

### Employee Stats Card (Mobile Dashboard)

```
┌─────────────────────────────────────┐
│  This week              ┌─────────┐ │
│  ┌──────────┐           │ Request  │ │
│  │   35h    │           │   an     │ │
│  │          │           │ absence  │ │
│  │ ████████ │           │  [+]     │ │
│  │ Goal     │           └─────────┘ │
│  │ reached ✅│                       │
│  └──────────┘                       │
└─────────────────────────────────────┘
```

**Stats Card Implementation:**
- Container: `bg-neutral-900 text-white rounded-3xl h-36`
- Progress Bar: `h-1.5 bg-neutral-700 rounded-full` with `bg-emerald-400` fill
- Label: `text-xs font-bold uppercase text-neutral-400`
- Value: `text-3xl font-bold`

### Absence Request Flow Visual

**Request Types Grid (2x2):**
| Type | Icon | Color Class |
|------|------|-------------|
| Paid Leave | `Plane` | `bg-emerald-100 text-emerald-700` |
| Sick Leave | `Thermometer` | `bg-rose-100 text-rose-700` |
| School / Training | `GraduationCap` | `bg-neutral-100 text-neutral-700` |
| Child Sick | `Baby` | `bg-blue-100 text-blue-700` |

**Selection State:**
- Unselected: `border-transparent bg-white shadow-sm`
- Selected: `border-neutral-900 bg-neutral-50 border-2`

### Today's Shift Card (Employee)

```
┌─────────────────────────────────────────────────┐
│  [🔵] Today                                     │
│  ┌─────────────────────────────────────────────┐│
│  │ [💼]  Surgery            [✓] / [✓✓]        ││
│  │       Dr. Martin • 8:30am - 6:30pm         ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Confirmation States:**
- Pending: `p-3 bg-neutral-100 rounded-full` with `Check` icon
- Confirmed: `p-3 bg-emerald-100 text-emerald-600 rounded-full` with `CheckCircle2` icon

### Admin Planning Grid Layout

```
┌──────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ Employee │ Mon 12 │ Tue 13 │ Wed 14 │ Thu 15 │ Fri 16 │ Sat 17 │
├──────────┼────────┼────────┼────────┼────────┼────────┼────────┤
│ 👨‍⚕️ Dr.Martin │ CHIR │ CHIR │ CHIR │ CHIR │ CHIR │ OFF  │
│ 👩‍⚕️ Julie    │ ACC  │ CHIR │ OFF  │ CHIR │ VAC  │ ACC  │
│ 👨‍💻 Thomas   │ CHIR │ ACC  │ ACC  │ OFF  │ ACC  │ OFF  │
│ 🎓 Eva      │ ACC  │ ACC  │ ACC  │SCHOOL│SCHOOL│ OFF  │
└──────────┴────────┴────────┴────────┴────────┴────────┴────────┘
```

**Grid Structure:**
- Container: `grid grid-cols-[180px_repeat(6,1fr)]`
- Header Row: `bg-neutral-50/50 border-b border-neutral-100`
- Employee Cell: Avatar emoji + Name (bold) + Role (10px uppercase)
- Shift Cell: `min-h-[60px] rounded-xl border p-2`
- Cell Dividers: `border-l border-dashed border-neutral-100`

### Micro-Copy Examples

**Greeting (Employee Dashboard):**
```
"Hello,
Julie"
```
Font: `text-3xl font-extrabold tracking-tight`

**Stats Label:**
- "This week" → `text-xs font-bold uppercase text-neutral-400`
- "Goal reached ✅" → `text-[10px] text-neutral-400`

**Today Indicator:**
- Pulse dot: `w-2 h-2 rounded-full bg-indigo-500 animate-pulse`
- Label: "Today" in `font-bold text-lg`

**Upcoming Days Label:**
- "Upcoming Days" → `font-bold text-lg text-neutral-400`

**Absence CTA:**
- "Request an absence" → `font-bold text-lg text-neutral-900`
- "Leave, Sick..." → `text-xs text-neutral-500`

**Admin Toolbar:**
- Week selector: "Week 42" with `Calendar` icon
- Generate CTA: "Auto-Generate" with `Sparkles` icon (yellow-300)

### Color Semantic Reference

| Context | Color | Hex | Usage |
|---------|-------|-----|-------|
| Truth/Validation | Vet Teal | `#009588` | Primary actions, validation states, medical trust |
| UI Actions | Electric Indigo | `#4F46E5` | Buttons, links, active states |
| Alerts/Human | Vital Orange | `#F97316` | Warnings, absence tags, soft rule violations |
| Success | Emerald | `#10B981` | Confirmed states, approved badges |
| Danger | Rose | `#F43F5E` | Hard conflicts, blocking errors |
| Neutral | Gray-900 | `#171717` | Primary text, logo, main CTAs |

### Animation Guidelines

**Micro-motion:**
- Hover scale: `hover:scale-[1.02]` or `hover:scale-[1.05]`
- Transition: `transition-all` with default duration
- Pulse: `animate-pulse` for "today" indicators and live status

**Entry Animations:**
- Fade in: `animate-in fade-in`
- Slide from right: `animate-in slide-in-from-right duration-500`
- Slide from bottom: `animate-in fade-in slide-in-from-bottom-4`

### Apprentice School Day Declaration UI

**Declaration Interface:**
- Calendar-based date picker (tap to select dates)
- Selected dates highlighted with `SCHOOL` shift color
- Submit CTA: "Submit my school days"
- Reminder banner (if undeclared after 25th): Orange warning banner

**Micro-copy:**
- Title: "My School Days - [Month]"
- Instruction: "Select your school days for the upcoming month"
- Reminder: "⚠️ Remember to declare your days before the 25th"
- Success: "School days saved ✓"
