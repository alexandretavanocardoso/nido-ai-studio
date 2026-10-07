"use client";

import { useCharacter } from "@/lib/useCharacter";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { TagInput } from "@/components/ui/TagInput";
import { Chip } from "@/components/ui/Chip";
import { formatos, plataformas } from "@/data/choices";
import { tx } from "@/lib/i18n/tx";

export function NichoStep({ id }: { id: string }) {
  const { character, set } = useCharacter(id);
  if (!character) return null;
  const n = character.nicho;

  function toggleList(list: string[], v: string) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={tx("Nicho principal")} fieldId="nicho.principal">
          <Input
            value={n.principal ?? ""}
            onChange={(e) => set((c) => (c.nicho.principal = e.target.value))}
            placeholder={tx("Ex.: Produtividade pra criativos")}
          />
        </Field>
        <Field label={tx("Subnicho")} fieldId="nicho.subnicho" optional>
          <Input
            value={n.subnicho ?? ""}
            onChange={(e) => set((c) => (c.nicho.subnicho = e.target.value))}
            placeholder={tx("Ex.: Freelancers que vivem com burnout")}
          />
        </Field>
      </div>

      <Field
        label={tx("Público-alvo")}
        fieldId="nicho.publico"
        aiDescricao="Descrição do público ideal: idade, contexto de vida, dores, desejos. Como se fosse uma pessoa real."
        hint={tx("Idade, dores, desejos — descreva como uma pessoa real.")}
      >
        <Textarea
          rows={3}
          value={n.publico ?? ""}
          onChange={(e) => set((c) => (c.nicho.publico = e.target.value))}
          placeholder={tx(
            "Ex.: Criativas de 25–38 anos, autônomas, cansadas de métodos genéricos, querem rotina que caiba na vida real.",
          )}
        />
      </Field>

      <Field
        label={tx("Promessa do perfil em 1 frase")}
        fieldId="nicho.promessa"
        aiDescricao="Promessa em 1 frase no formato 'Quem me segue ganha X.' Direta e concreta."
        hint={tx("‘Quem me segue ganha X.’")}
      >
        <Input
          value={n.promessa ?? ""}
          onChange={(e) => set((c) => (c.nicho.promessa = e.target.value))}
          placeholder={tx(
            "Ex.: Quem me segue aprende a terminar o dia sem culpa.",
          )}
        />
      </Field>

      <section>
        <div className="label-cap mb-2">
          {tx("O que mais performa no nicho")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={tx("Formatos")} fieldId="nicho.performaFormatos">
            <div className="flex flex-wrap gap-2">
              {formatos.map((f) => (
                <Chip
                  key={f}
                  selected={n.performaFormatos.includes(f)}
                  onClick={() =>
                    set(
                      (c) =>
                        (c.nicho.performaFormatos = toggleList(
                          c.nicho.performaFormatos,
                          f,
                        )),
                    )
                  }
                >
                  {f}
                </Chip>
              ))}
            </div>
          </Field>
          <Field
            label={tx("Temas que performam")}
            fieldId="nicho.performaTemas"
            optional
          >
            <Textarea
              rows={2}
              value={n.performaTemas ?? ""}
              onChange={(e) =>
                set((c) => (c.nicho.performaTemas = e.target.value))
              }
              placeholder={tx("Ex.: rotinas, antes-e-depois, erros honestos")}
            />
          </Field>
          <Field
            label={tx("Ganchos que funcionam")}
            fieldId="nicho.performaGanchos"
            optional
            className="sm:col-span-2"
          >
            <Textarea
              rows={2}
              value={n.performaGanchos ?? ""}
              onChange={(e) =>
                set((c) => (c.nicho.performaGanchos = e.target.value))
              }
              placeholder={tx(
                "Ex.: ‘Pare de X e comece a Y’, listas de 3, perguntas diretas",
              )}
            />
          </Field>
          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field
              label={tx("Duração")}
              fieldId="nicho.performaDuracao"
              optional
            >
              <Input
                value={n.performaDuracao ?? ""}
                onChange={(e) =>
                  set((c) => (c.nicho.performaDuracao = e.target.value))
                }
                placeholder={tx("30–60s")}
              />
            </Field>
            <Field
              label={tx("Frequência")}
              fieldId="nicho.performaFrequencia"
              optional
            >
              <Input
                value={n.performaFrequencia ?? ""}
                onChange={(e) =>
                  set((c) => (c.nicho.performaFrequencia = e.target.value))
                }
                placeholder="4x/sem"
              />
            </Field>
            <Field
              label={tx("Horários")}
              fieldId="nicho.performaHorarios"
              optional
            >
              <Input
                value={n.performaHorarios ?? ""}
                onChange={(e) =>
                  set((c) => (c.nicho.performaHorarios = e.target.value))
                }
                placeholder={tx("19h–21h")}
              />
            </Field>
          </div>
        </div>
      </section>

      <Field
        label={tx("Concorrentes / referências (3 a 5)")}
        fieldId="nicho.concorrentes"
        hint={tx("Separados por vírgula ou Enter.")}
      >
        <TagInput
          value={n.concorrentes}
          onChange={(v) => set((c) => (c.nicho.concorrentes = v))}
          placeholder={tx("Ex.: @perfil1, @perfil2")}
          max={10}
        />
      </Field>

      <Field
        label={tx("O que o seu influenciador faz de diferente")}
        fieldId="nicho.diferencial"
        aiDescricao="Diferencial do personagem no nicho. Específico — não 'ser autêntico'."
      >
        <Textarea
          rows={3}
          value={n.diferencial ?? ""}
          onChange={(e) => set((c) => (c.nicho.diferencial = e.target.value))}
          placeholder={tx(
            "Ex.: usa humor amargo onde o nicho é motivacional; mostra o processo real, não só o resultado.",
          )}
        />
      </Field>

      <Field label={tx("Plataformas prioritárias")} fieldId="nicho.plataformas">
        <div className="flex flex-wrap gap-2">
          {plataformas.map((p) => (
            <Chip
              key={p}
              selected={n.plataformas.includes(p)}
              onClick={() =>
                set(
                  (c) =>
                    (c.nicho.plataformas = toggleList(c.nicho.plataformas, p)),
                )
              }
            >
              {p}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  );
}
