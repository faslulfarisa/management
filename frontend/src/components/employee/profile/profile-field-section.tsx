interface ProfileField {
  label: string;
  value: string | null | undefined;
}

interface ProfileFieldSectionProps {
  title: string;
  fields: ProfileField[];
}

export function ProfileFieldSection({ title, fields }: ProfileFieldSectionProps) {
  const visibleFields = fields.filter((f) => f.value);
  if (!visibleFields.length) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
        {title}
      </p>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {visibleFields.map((f) => (
          <div key={f.label} className="flex items-start gap-3 px-4 py-3.5">
            <p className="text-sm text-muted-foreground w-32 flex-shrink-0">{f.label}</p>
            <p className="text-sm font-medium text-foreground flex-1 text-right">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
