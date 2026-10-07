import { describe, expect, it } from "vitest";
import { emptyCharacter } from "./defaults";
import { lerPersonagemExportado } from "./importar";

describe("importar personagem exportado", () => {
  it("o JSON do 'Exportar ficha' volta como personagem novo, com os mesmos dados", () => {
    const c = emptyCharacter();
    c.identidade.nome = "Gru";
    c.visual.cabelo = "careca";
    c.videos = [
      { id: "v1", name: "ok.mp4", key: "users/u/videos/a.mp4", size: 1, contentType: "video/mp4" },
      { id: "v2", name: "proc.mp4", key: "", size: 0, contentType: "video/mp4", status: "processando", jobId: "j" },
    ] as never;
    const r = lerPersonagemExportado(JSON.stringify(c, null, 2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.character.id).not.toBe(c.id);
    expect(r.character.identidade.nome).toBe("Gru");
    expect(r.character.visual.cabelo).toBe("careca");
    expect(r.character.videos?.map((v) => v.id)).toEqual(["v1"]);
  });
  it("recusa arquivo que não é JSON ou não é personagem", () => {
    expect(lerPersonagemExportado("isso não é json")).toEqual({ ok: false, erro: "O arquivo não é um JSON válido." });
    expect(lerPersonagemExportado('{"foo": 1}').ok).toBe(false);
  });
});
