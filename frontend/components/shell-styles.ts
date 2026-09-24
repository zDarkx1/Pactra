// Literal Tailwind utilities: the parent theme supplies the existing palette and motion tokens.
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--focus)';
const feedback = 'transition-colors duration-(--duration-feedback) ease-(--ease-feedback) motion-reduce:transition-none';
const iconButton = `inline-flex size-11 min-w-11 items-center justify-center rounded-(--radius-md) border border-(--control-border) bg-transparent p-0 text-(--ink) hover:bg-(--surface-card) ${feedback} ${focus} [&_svg]:shrink-0 motion-safe:[&_svg]:transition-transform motion-safe:[&_svg]:duration-(--duration-enter) motion-safe:active:not-focus-visible:[&_svg]:scale-94`;
export const shellStyles = {
  wordmark: `inline-flex min-h-11 w-fit items-center font-(family-name:--font-ui) text-[1.625rem] font-medium tracking-[-0.04em] text-(--ink) no-underline max-[380px]:text-[1.1875rem] [&_span]:text-(--link) ${focus}`,
  publicHeader: 'border-b border-(--hairline)',
  publicHeaderInner: 'mx-auto flex min-h-19 max-w-[1320px] flex-wrap items-center gap-3 px-5 py-3.5 md:min-h-22 md:flex-nowrap md:gap-6 md:px-10 md:py-4 lg:gap-10 max-[380px]:px-4 [&>div:last-child]:ml-auto',
  publicNavigation: `ml-auto hidden items-center gap-5 md:flex lg:gap-7 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-sm [&_a]:font-medium [&_a]:text-(--body) [&_a]:underline [&_a]:decoration-transparent [&_a:hover]:decoration-current`,
  headerActions: 'flex min-w-0 flex-wrap items-center justify-end gap-2 max-[380px]:gap-1.5',
  headerWorkspace: `inline-flex min-h-11 items-center justify-center gap-2 py-2 text-[0.8125rem] font-medium text-(--ink) underline decoration-(--control-border) underline-offset-5 hover:decoration-(--ink) md:gap-3 md:text-sm ${focus}`,
  shell: 'group/shell block min-h-dvh overflow-x-clip font-(family-name:--font-ui) text-(--ink) md:grid md:grid-cols-[224px_minmax(0,1fr)] md:data-[sidebar=collapsed]:grid-cols-[72px_minmax(0,1fr)]',
  sidebar: 'sticky top-0 z-2 hidden h-dvh min-w-0 md:block',
  sidebarSurface: 'pointer-events-none absolute inset-y-0 left-0 w-56 origin-left bg-(--surface-soft) shadow-[inset_-1px_0_var(--hairline)] group-data-[sidebar=collapsed]/shell:scale-x-[0.32142857] group-data-[sidebar-motion=pointer]/shell:transition-transform group-data-[sidebar-motion=pointer]/shell:duration-(--duration-drawer) group-data-[sidebar-motion=pointer]/shell:ease-(--ease-drawer) motion-reduce:transition-none',
  sidebarContent: 'relative flex h-full min-w-0 flex-col overflow-x-hidden overflow-y-auto px-4 py-6 group-data-[sidebar=collapsed]/shell:px-3.5 [&>a:first-child]:ml-3 group-data-[sidebar=collapsed]/shell:[&>a:first-child]:ml-0 group-data-[sidebar=collapsed]/shell:[&>a:first-child]:w-11 group-data-[sidebar=collapsed]/shell:[&>a:first-child]:justify-center [&_a:focus-visible]:outline-offset-[-2px]',
  workspaceLabel: 'mx-3 mt-10 mb-3 min-h-[18px] text-xs font-medium text-(--muted) group-data-[sidebar=collapsed]/shell:opacity-0 motion-safe:group-data-[sidebar-motion=pointer]/shell:transition-opacity motion-safe:group-data-[sidebar-motion=pointer]/shell:duration-(--duration-enter)',
  navigation: 'grid gap-1',
  navigationLink: `flex min-h-12 items-center gap-2.5 rounded-(--radius-md) p-3 text-sm leading-[1.4] font-medium text-(--body) no-underline aria-[current=page]:bg-(--surface-cream-strong) aria-[current=page]:text-(--ink) aria-[current=page]:shadow-[inset_2px_0_0_var(--link)] aria-[current=page]:[&_svg]:text-(--link) not-aria-[current=page]:hover:bg-(--surface-card) group-data-[sidebar=collapsed]/shell:justify-center [&_svg]:shrink-0 motion-safe:[&_svg]:transition-transform motion-safe:[&_svg]:duration-(--duration-enter) motion-safe:hover:not-focus-visible:[&_svg]:translate-x-0.5 ${feedback} ${focus}`,
  sidebarCreate: `mt-5 flex min-h-11 items-center gap-2.5 border-t border-(--hairline) px-3 py-2.5 text-sm text-(--link) no-underline hover:bg-(--surface-card) group-data-[sidebar=collapsed]/shell:justify-center [&_svg]:shrink-0 focus-visible:outline-offset-[-2px] ${focus}`,
  sidebarNote: 'mx-3 mt-auto pt-12 [&_p]:mt-2 [&_p]:mb-4 [&_p]:text-[0.8125rem] [&_p]:text-(--muted) [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:gap-2 [&_a]:text-[0.8125rem] [&_a]:text-(--link) [&_a]:underline',
  releaseLabel: 'flex items-center gap-2 text-[0.8125rem] font-medium text-(--body-strong) [&_svg]:size-4',
  workspace: 'min-w-0',
  topbar: 'flex min-h-19 flex-wrap items-center justify-between gap-3 border-b border-(--hairline) px-5 py-3.5 md:min-h-[81px] md:flex-nowrap md:gap-4 md:px-6 md:py-4 lg:px-8 max-[380px]:px-4',
  topbarLocation: 'hidden min-w-0 items-center gap-3 md:flex',
  sidebarToggle: `inline-flex min-h-11 w-11 min-w-11 items-center justify-center rounded-(--radius-sm) border-0 bg-transparent p-2.5 text-(--muted) hover:bg-(--surface-card) hover:text-(--ink) [&_svg]:transition-transform [&_svg]:duration-(--duration-enter) [&_svg]:ease-(--ease-out) group-data-[sidebar=collapsed]/shell:[&_svg]:[transform:rotateY(180deg)] group-data-[sidebar-motion=instant]/shell:[&_svg]:transition-none motion-reduce:[&_svg]:transition-none ${feedback} ${focus}`,
  desktopContext: 'hidden flex-wrap items-center gap-2.5 text-[0.8125rem] text-(--muted) md:flex [&_svg]:size-3 [&_[aria-current]]:text-(--ink) [&_a]:text-(--body) [&_a]:underline [&_a]:decoration-(--hairline)',
  mobileBrand: 'inline-flex md:hidden',
  main: 'mx-auto max-w-7xl px-5 pt-7 pb-12 md:px-6 md:pt-10 md:pb-16 lg:px-10 min-[1600px]:px-12 max-[380px]:px-4',
  pageHeader: 'mb-6 border-b border-(--hairline) pb-6 md:mb-8 [&_h1]:mt-0 [&_h1]:mb-2 [&_h1]:text-[1.75rem] [&_h1]:font-medium [&_h1]:tracking-[-0.025em] [&_p]:m-0 [&_p]:max-w-[70ch] [&_p]:text-(--muted)',
  skipLink: `fixed top-3 left-4 z-100 -translate-y-[200%] rounded-(--radius-sm) bg-(--ink) px-5 py-3 text-(--canvas) focus:translate-y-0 ${focus}`,
  iconButton,
  menuButton: `${iconButton} md:hidden`,
  overlay: 'fixed inset-0 z-50 bg-[rgb(20_20_19/36%)] font-(family-name:--font-ui)',
  drawer: 'h-dvh max-h-dvh w-[min(320px,calc(100%_-_32px))] overflow-y-auto overscroll-contain rounded-r-(--radius-lg) border-r border-(--hairline) bg-(--surface-soft) p-6 text-(--ink) shadow-[12px_0_40px_rgb(20_20_19/10%)] motion-reduce:transform-none',
  dialog: 'outline-none',
  drawerHeader: 'mb-8 flex items-center justify-between gap-3 [&_h2]:m-0 [&_h2]:text-lg [&_h2]:font-semibold',
  drawerFooter: 'mt-12 border-t border-(--hairline) pt-6 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:gap-3 [&_a]:text-sm [&_a]:text-(--link) [&_a]:underline [&_p]:mt-4 [&_p]:text-[0.8125rem] [&_p]:text-(--muted)',
} as const;

export const uiStyles = {
  button: `group/button relative isolate inline-flex min-h-12 min-w-11 items-center justify-center rounded-(--radius-md) border-0 bg-transparent px-5 py-3 text-center font-(family-name:--font-ui) text-sm leading-[1.45] font-semibold no-underline before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:border before:content-[''] before:transition-[background-color,border-color,transform] before:duration-(--duration-feedback) before:ease-(--ease-feedback) disabled:text-(--muted) disabled:before:border-(--hairline) disabled:before:bg-(--primary-disabled) motion-safe:enabled:active:not-focus-visible:before:scale-[0.98] motion-safe:enabled:hover:not-active:not-focus-visible:before:-translate-y-px motion-reduce:before:transition-none focus-visible:before:transition-none ${focus}`,
  variants: {
    primary: 'text-(--on-primary) before:border-transparent before:bg-(--primary) enabled:hover:before:bg-(--primary-hover) enabled:active:before:bg-(--primary-active) [&:is(a)]:hover:before:bg-(--primary-hover) [&:is(a)]:active:before:bg-(--primary-active)',
    secondary: 'text-(--ink) before:border-(--control-border) before:bg-transparent enabled:hover:before:bg-(--surface-card) enabled:active:before:bg-(--surface-cream-strong) [&:is(a)]:hover:before:bg-(--surface-card) [&:is(a)]:active:before:bg-(--surface-cream-strong)',
    quiet: 'text-(--link) before:border-transparent before:bg-transparent enabled:hover:before:bg-(--surface-card) enabled:active:before:bg-(--surface-cream-strong) [&:is(a)]:hover:before:bg-(--surface-card) [&:is(a)]:active:before:bg-(--surface-cream-strong)',
  },
  buttonContent: 'inline-flex items-center justify-center gap-3 transition-transform duration-(--duration-enter) ease-(--ease-out) motion-safe:group-[:enabled:active:not(:focus-visible)]/button:scale-[0.98] motion-safe:group-[:enabled:hover:not(:active):not(:focus-visible)]/button:-translate-y-px motion-reduce:transition-none group-focus-visible/button:transition-none',
  label: 'col-start-1 row-start-1 inline-flex items-center justify-center gap-3',
  alert: 'flex items-start gap-3 border-l-[3px] bg-(--surface-soft) p-4 font-(family-name:--font-ui) text-sm [&_svg]:mt-0.5 [&_svg]:shrink-0 [&_strong]:mb-1 [&_strong]:block [&_p:last-child]:mb-0',
  tones: {
    info: 'border-(--info)',
    error: 'border-(--error) [&_svg]:text-(--error) [&_strong]:text-(--error)',
    success: 'border-(--success) [&_svg]:text-(--success) [&_strong]:text-(--success)',
    warning: 'border-(--warning) [&_svg]:text-(--warning) [&_strong]:text-(--warning)',
  },
} as const;
