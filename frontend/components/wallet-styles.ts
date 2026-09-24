const control = 'min-h-11 cursor-pointer rounded-(--radius-md) border px-3.5 py-2.5 font-(family-name:--font-ui) text-[13px] font-medium transition-colors duration-(--duration-feedback) ease-(--ease-feedback) focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--focus) motion-reduce:transition-none [&>span]:inline-flex [&>span]:items-center [&>span]:justify-center [&>span]:gap-2 motion-safe:[&>span]:transition-transform motion-safe:[&>span]:duration-(--duration-enter) motion-safe:enabled:hover:not-active:not-focus-visible:[&>span]:-translate-y-px motion-safe:enabled:active:not-focus-visible:[&>span]:scale-[0.98]';
export const walletStyles = {
  wrapper: 'relative min-w-0 max-w-full',
  actions: 'flex min-w-0 flex-wrap items-center justify-end gap-2 max-[600px]:gap-1',
  accountName: 'max-w-28 truncate',
  button: `${control} flex items-center justify-center gap-3 border-transparent bg-(--primary) text-(--on-primary) disabled:cursor-wait disabled:bg-(--primary-disabled) disabled:text-(--muted) enabled:hover:bg-(--primary-hover) enabled:active:bg-(--primary-active) max-[600px]:px-2.5 max-[600px]:py-2 max-[600px]:text-xs`,
  account: `${control} inline-flex items-center gap-2 border-(--hairline) bg-(--surface-soft) text-(--ink) hover:bg-(--surface-cream-strong) active:bg-(--primary-active) max-[600px]:px-2.5 max-[600px]:py-2 max-[600px]:text-xs`,
  retry: `${control} border-transparent bg-transparent !px-2 !py-1 text-(--link) underline`,
  unconfigured: 'inline-flex min-h-11 items-center gap-2 font-(family-name:--font-ui) text-xs text-(--muted) [&>span]:size-1.5 [&>span]:rounded-full [&>span]:bg-(--warning)',
  error: 'mt-2 mb-0 max-w-80 text-xs leading-normal text-(--error) wrap-anywhere [&_button]:block',
} as const;
