export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.5rem] font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-meta">{description}</p>}
      </div>
      {children}
    </header>
  );
}
