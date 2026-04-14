import { cn } from "@/lib/utils";

type ModulePlaceholderProps = {
  icon: string;
  title: string;
  message?: string;
  className?: string;
};

export function ModulePlaceholder({
  icon,
  title,
  message,
  className,
}: ModulePlaceholderProps) {
  return (
    <div
      className={cn(
        "flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center",
        className,
      )}
    >
      <div className="text-6xl" aria-hidden="true">
        {icon}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
        {title}
      </h1>
      {message ? (
        <p className="text-sm text-slate-400">{message}</p>
      ) : null}
    </div>
  );
}
