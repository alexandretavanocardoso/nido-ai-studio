export const EMAIL_CONTATO = "nidodotglobal@gmail.com";

/** Uma seção numerada das páginas legais (/privacidade e /termos). */
export function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-ink font-bold text-lg mb-3">{titulo}</h2>
      <div className="grid gap-3 text-[15px] leading-relaxed text-ink-mute [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-ink [&_strong]:font-semibold [&_a]:text-accent [&_a]:underline">
        {children}
      </div>
    </section>
  );
}
