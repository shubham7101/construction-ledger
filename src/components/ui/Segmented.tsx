import clsx from "clsx";

type SegmentedOption<T extends string> =
  | readonly [T, string]
  | { readonly key: T; readonly label: string };

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  const items = options.map((option) =>
    "key" in option ? option : { key: option[0], label: option[1] },
  );

  return (
    <fieldset
      aria-label={ariaLabel}
      className={clsx(
        "m-0 grid min-w-0 gap-1 rounded-xl border-none bg-slate-100 p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={clsx(
            "min-h-10 cursor-pointer rounded-lg border-none text-xs font-bold transition-all",
            value === key
              ? "bg-amber-500 text-slate-950 shadow-sm"
              : "bg-transparent text-slate-500 hover:bg-white/70 hover:text-slate-700",
          )}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
