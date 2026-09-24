# Landing mega menu

Product, Principles and Learn share a single active-menu state. Desktop menus span the header width with an introduction, grouped destination links/descriptions and an editorial feature. CSS opacity/translate transitions and rotating chevrons add motion without another library. Hidden panels are inert and aria-hidden immediately. Mobile retains React Aria modal/disclosures.

Verified desktop1440 panel width, pointer movement into panel, one open menu at a time, Escape/focus restoration, ArrowDown into first link, outside-pointer dismissal, reduced-motion zero transition, and mobile Escape. No wallet or business behavior changes. The menu overlays content rather than shifting page layout.
