# Design System Strategy: Tactical Precision

## 1. Overview & Creative North Star: "The Clinical Vanguard"
This design system is engineered for high-stakes environments where clarity equals lives saved. Our Creative North Star is **"The Clinical Vanguard."** We move beyond the generic "SaaS dashboard" by blending the hyper-functional aesthetics of aerospace HUDs with the refined, airy minimalism of high-end automotive interfaces (Tesla-inspired). 

The experience is defined by **intentional asymmetry** and **atmospheric depth**. We reject the "boxed-in" feel of traditional grids. Instead, we use expansive white space and "floating" glass modules to create a layout that feels less like a website and more like a sophisticated command deck. Every pixel must feel deliberate, tactical, and premium.

---

## 2. Colors & Surface Architecture
The palette is a study in "High-Tech Neutrals" punctuated by "Action Cyans." We utilize a monochromatic base to ensure that when color is used (for emergencies or data points), it commands absolute attention.

### The "No-Line" Rule
**Prohibit 1px solid borders for sectioning.** Conventional lines create visual noise. Boundaries must be defined solely through:
*   **Background Shifts:** A `surface-container-low` module sitting on a `background` base.
*   **Tonal Transitions:** Using depth to imply containment.
*   **Soft Voids:** Using generous padding to "frame" content.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers.
*   **Base Layer:** `background` (#f7f9fb) – The foundation.
*   **Secondary Layer:** `surface-container-low` (#f2f4f6) – Used for large sidebar or navigation areas.
*   **Action Layer:** `surface-container-lowest` (#ffffff) – Used for primary interaction cards to create a "lifted" feel against the off-white background.
*   **Nesting:** When placing an element inside a card, do not use a border; shift the inner container to `surface-container-high` (#e6e8ea) to create an "inset" tactical look.

### The "Glass & Gradient" Rule
To achieve a signature feel, main CTAs and critical status indicators should use a **Signature Texture**: a subtle linear gradient from `secondary` (#00677f) to `secondary_fixed_dim` (#4cd6ff). For floating overlays, use **Glassmorphism**:
*   `surface` at 70% opacity.
*   `backdrop-filter: blur(20px) saturate(150%);`
*   This ensures the UI feels integrated with the "environment" rather than pasted on top.

---

## 3. Typography: Tactical Hierarchy
The interplay between **Space Grotesk** and **Inter** creates a balance between "Command Center" authority and "Clinical" readability.

*   **Display & Headlines (Space Grotesk):** These are your tactical readouts. Use `display-lg` for critical metrics. The monospace-leaning curves of Space Grotesk should feel like a premium instrument cluster.
*   **Body (Inter):** All long-form data and instructional text must use Inter. It is invisible, efficient, and reduces cognitive load during emergencies.
*   **Labels (Space Grotesk):** Use `label-md` in all-caps with 5% letter spacing for secondary metadata. This reinforces the "instrumentation" look.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to simulate "pop"; we use them to simulate **Atmosphere**.

*   **The Layering Principle:** Avoid elevation "levels" 1-5. Use "Tonal Stacking." Place a `surface-container-lowest` card on a `surface-container-low` background. The slight delta in hex code creates a sophisticated, soft lift.
*   **Ambient Shadows:** For floating modals (e.g., active dispatch alerts), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(25, 28, 30, 0.06);`. The shadow must be tinted with the `on-surface` color, never pure black.
*   **The Ghost Border:** If a boundary is strictly required for accessibility (e.g., input fields), use the `outline-variant` (#c6c6cd) at **15% opacity**. It should be felt, not seen.

---

## 5. Component Strategy

### Buttons (The Tactical Trigger)
*   **Primary:** Gradient fill (`secondary` to `secondary_fixed_dim`). Sharp `md` (0.375rem) corners. No border. Text in `on-secondary` (#ffffff).
*   **Tertiary:** No background. Use `label-md` (Space Grotesk) with a subtle `secondary` underline that expands on hover.

### Input Fields (The Data Entry)
*   Forbid "boxed" inputs. Use a "Subtle Inset" style: `surface-container-highest` background with a `sm` (0.125rem) bottom-only accent in `outline-variant`. 
*   Focus state: The bottom accent transitions to `secondary` (Vibrant Cyan).

### Cards & Lists (The Tactical Feed)
*   **Zero Dividers:** Lists are separated by 8px or 12px of vertical white space.
*   **Interaction:** On hover, a list item should shift from `surface` to `surface-container-low`.
*   **Status Indicators:** Use a "Glow" effect rather than a flat dot. A small `secondary` circle with a 4px blur of the same color creates a "live" hardware feel.

### Specialized Component: The "Active Response" Pulse
For AI-driven alerts, use a `surface-container-lowest` card with a glassmorphic blur and a 2px "Ghost Border" that slowly pulses in opacity. This draws the eye through motion, not high-contrast noise.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Whitespace:** Give metrics room to breathe. High-end design feels "expensive" because it doesn't crowd the screen.
*   **Use Asymmetric Grids:** Align critical data to a strong left axis, but allow secondary visualizations to float with more organic spacing.
*   **Color as Signal:** Only use `secondary` (Cyan) and `error` (Red) for actionable data. Everything else stays in the Navy/Neutral range.

### Don't:
*   **Don't use 100% Black:** Even for text, use `on-surface` (#191c1e). Pure black kills the "light mode" clinical softness.
*   **Don't use rounded pills for everything:** Stick to `md` (0.375rem) for a more professional, "machined" look. Reserve `full` rounding only for status chips.
*   **Don't use standard Tooltips:** Create "Info Panes" that blur the background, maintaining the glassmorphic tactical aesthetic.