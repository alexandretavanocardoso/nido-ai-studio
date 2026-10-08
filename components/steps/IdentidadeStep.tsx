"use client";
import { tx } from "@/lib/i18n/tx";

import { useCharacter } from "@/lib/useCharacter";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { CardChoice } from "@/components/ui/CardChoice";
import { TagInput } from "@/components/ui/TagInput";
import { formas, generos } from "@/data/choices";

export function IdentidadeStep({ id }: { id: string }) {
  const { character, set } = useCharacter(id);
  if (!character) return null;
  const d = character.identidade;

  return (
    <div className="grid grid-cols-1 gap-5">
      <Field
        label={tx("Nome / apelido")}
        fieldId="identidade.nome"
        counter={{ value: d.nome.length, max: 50 }}
      >
        <Input
          maxLength={50}
          placeholder={tx("Ex.: Lila, Jr., Noa, Vulpes…")}
          value={d.nome}
          onChange={(e) => set((c) => (c.identidade.nome = e.target.value))}
        />
      </Field>

      <Field label={tx("Gênero")} fieldId="identidade.genero">
        <div className="grid grid-cols-3 gap-3">
          {generos.map((g) => (
            <CardChoice
              key={g.value}
              title={g.label}
              icon={<span className="text-lg">{g.emoji}</span>}
              selected={d.genero === g.value}
              onClick={() => set((c) => (c.identidade.genero = g.value))}
            />
          ))}
        </div>
      </Field>

      <Field
        label={tx("Forma")}
        fieldId="identidade.forma"
        hint={tx("A natureza do personagem define o resto da imagem.")}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {formas.map((f) => (
            <CardChoice
              key={f.value}
              title={f.label}
              description={f.descricao}
              selected={d.forma === f.value}
              onClick={() => set((c) => (c.identidade.forma = f.value))}
            />
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label={tx("Idade aparente")}
          fieldId="identidade.idadeAparente"
          optional
        >
          <Input
            placeholder={tx("Ex.: 28 anos, atemporal, infantil…")}
            value={d.idadeAparente ?? ""}
            onChange={(e) =>
              set((c) => (c.identidade.idadeAparente = e.target.value))
            }
          />
        </Field>
        <Field label={tx("Cidade / País")} fieldId="identidade.cidade" optional>
          <Input
            placeholder={tx("Ex.: São Paulo, BR")}
            value={d.cidade ?? ""}
            onChange={(e) => set((c) => (c.identidade.cidade = e.target.value))}
          />
        </Field>
        <Field label={tx("Idioma")} fieldId="identidade.idioma" optional>
          <Input
            placeholder={tx("Ex.: Português do Brasil")}
            value={d.idioma ?? ""}
            onChange={(e) => set((c) => (c.identidade.idioma = e.target.value))}
          />
        </Field>
        <Field label={tx("Sotaque")} fieldId="identidade.sotaque" optional>
          <Input
            placeholder={tx(
              "Ex.: Paulistano suave, neutro, interior do nordeste",
            )}
            value={d.sotaque ?? ""}
            onChange={(e) =>
              set((c) => (c.identidade.sotaque = e.target.value))
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label={tx("Ocupação na vida real")}
          fieldId="identidade.ocupacao"
          optional
          hint={tx("O que ele faz além de criar conteúdo?")}
        >
          <Input
            placeholder={tx(
              "Ex.: Arquiteta de interiores, DJ nos fins de semana",
            )}
            value={d.ocupacao ?? ""}
            onChange={(e) =>
              set((c) => (c.identidade.ocupacao = e.target.value))
            }
          />
        </Field>
        <Field
          label={tx("@ sugeridos")}
          fieldId="identidade.handles"
          optional
          hint={tx("Até 3 opções de handle. Enter para adicionar.")}
        >
          <TagInput
            value={d.handles ?? []}
            onChange={(v) => set((c) => (c.identidade.handles = v))}
            placeholder={tx("Ex.: @lilaserafina")}
            max={3}
          />
        </Field>
      </div>

      <Field
        label={tx("Bio em 1 linha")}
        fieldId="identidade.bio"
        aiDescricao="Bio curta (até 140 chars) que resume o personagem em uma frase. Específica, não genérica."
        hint={tx(
          "O resumo do personagem. Pense em algo que você diria em uma reunião: ‘ele é o ___ que ___’.",
        )}
        counter={{ value: (d.bio ?? "").length, max: 140 }}
      >
        <Textarea
          maxLength={140}
          rows={2}
          placeholder={tx(
            "Ex.: Arquiteta de interiores que detesta minimalismo frio e defende cores saturadas.",
          )}
          value={d.bio ?? ""}
          onChange={(e) => set((c) => (c.identidade.bio = e.target.value))}
        />
      </Field>
    </div>
  );
}
