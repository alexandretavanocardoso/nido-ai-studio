"use client";
import { tx } from "@/lib/i18n/tx";

import { useCharacter } from "@/lib/useCharacter";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { TagInput } from "@/components/ui/TagInput";
import { Chip } from "@/components/ui/Chip";
import { modelosNegocio } from "@/data/choices";

export function MonetizacaoStep({ id }: { id: string }) {
  const { character, set } = useCharacter(id);
  if (!character) return null;
  const m = character.monetizacao;

  function toggle(list: string[], v: string) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <Field
        label={tx("Modelo de negócio")}
        fieldId="monetizacao.modelos"
        hint={tx("Selecione um ou mais.")}
      >
        <div className="flex flex-wrap gap-2">
          {modelosNegocio.map((p) => (
            <Chip
              key={p}
              selected={m.modelos.includes(p)}
              onClick={() =>
                set(
                  (c) =>
                    (c.monetizacao.modelos = toggle(c.monetizacao.modelos, p)),
                )
              }
            >
              {p}
            </Chip>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label={tx("Tipos de marca que combinam")}
          fieldId="monetizacao.marcasOk"
        >
          <TagInput
            value={m.marcasOk}
            onChange={(v) => set((c) => (c.monetizacao.marcasOk = v))}
            placeholder={tx("Ex.: papelaria independente, café, saúde mental")}
          />
        </Field>
        <Field
          label={tx("Tipos de marca que NÃO combinam")}
          fieldId="monetizacao.marcasNao"
        >
          <TagInput
            value={m.marcasNao}
            onChange={(v) => set((c) => (c.monetizacao.marcasNao = v))}
            placeholder={tx("Ex.: fast fashion, apostas, dietas restritivas")}
          />
        </Field>
      </div>

      <Field
        label={tx("Limites éticos")}
        fieldId="monetizacao.limites"
        aiDescricao="O que o personagem JAMAIS divulgaria mesmo com dinheiro bom na mesa. Específico, coerente com os valores."
        hint={tx(
          "O que ele jamais divulgaria — mesmo com um cheque bom na mesa.",
        )}
      >
        <Textarea
          rows={3}
          value={m.limites ?? ""}
          onChange={(e) => set((c) => (c.monetizacao.limites = e.target.value))}
          placeholder={tx(
            "Ex.: nunca anuncia produto que promete emagrecer; não trabalha com marca que testa em animais.",
          )}
        />
      </Field>

      <Field
        label={tx(
          "Transparência: como e onde ele avisa que é um personagem sintético",
        )}
        fieldId="monetizacao.transparencia"
        aiDescricao="Como e onde o personagem sinaliza publicamente que é sintético (bio, marca-d'água, pin no perfil, etc.)."
        hint={tx(
          "A primeira linha da bio? Pin no perfil? Em cada vídeo? Decida.",
        )}
      >
        <Textarea
          rows={3}
          value={m.transparencia ?? ""}
          onChange={(e) =>
            set((c) => (c.monetizacao.transparencia = e.target.value))
          }
          placeholder={tx(
            "Ex.: bio diz ‘personagem sintético criado por ___’; vídeos têm marca-d'água #sintético.",
          )}
        />
      </Field>
    </div>
  );
}
