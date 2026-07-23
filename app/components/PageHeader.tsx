export default function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      <p className="text-ink-gold text-xs uppercase tracking-[0.2em] font-semibold mb-2">
        {eyebrow}
      </p>
      <h1 className="font-serif text-white text-4xl md:text-5xl">{title}</h1>
      {subtitle && <p className="text-gray-500 text-sm mt-2">{subtitle}</p>}
    </div>
  );
}
