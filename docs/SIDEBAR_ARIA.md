# Sidebar React Aria pass

Workspace destination and create links now use React Aria Link composed with Next Link's render adapter: one real anchor, browser modified-click semantics, active aria-current, and original route-focus intent. Collapsed destinations use RAC TooltipTrigger/Tooltip for pointer and keyboard labels. Desktop collapse already used RAC Button; mobile modality remains RAC DialogTrigger/ModalOverlay/Modal/Dialog. A navigation landmark is intentionally retained instead of incorrectly assigning application-menu roles to page links.

Tailwind styling:248px expanded rail /72px collapsed, cream surfaces, coral outlined active row, rounded navigation/create actions, consistent header background and editorial page headings. Existing wallet/auth/task/checker logic unchanged.

Verified unit suite/typecheck/build plus Chromium: data-rac anchors, active checker, collapse persists across route navigation, focus tooltip/Escape/Enter, mobile drawer link closes and navigates, Escape dismisses, no pageerror/horizontal overflow. Desktop screenshot inspected. Public preview APIs remain locked except stateless checker.
