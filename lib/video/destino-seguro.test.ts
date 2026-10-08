import { describe, expect, it } from "vitest";
import http from "node:http";
import {
  abrirDownloadSeguro,
  exigirDestinoPublico,
  ipPrivado,
  resolverSoPublico,
} from "./destino-seguro";

describe("ipPrivado", () => {
  it("barra loopback, rede interna, link local e metadados da nuvem", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "::ffff:7f00:1",
    ])
      expect(ipPrivado(ip), ip).toBe(true);
  });

  it("deixa passar endereço público", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111"])
      expect(ipPrivado(ip), ip).toBe(false);
  });

  it("o que não é IP não passa", () => {
    expect(ipPrivado("localhost")).toBe(true);
  });
});

describe("exigirDestinoPublico", () => {
  it("recusa IP interno, localhost, porta fora do padrão, credenciais e outros protocolos", async () => {
    for (const url of [
      "http://127.0.0.1/a.mp4",
      "http://169.254.169.254/latest/meta-data/a.mp4",
      "http://[::1]/a.mp4",
      "http://localhost/a.mp4",
      "https://8.8.8.8:8443/a.mp4",
      "https://user:senha@8.8.8.8/a.mp4",
      "ftp://8.8.8.8/a.mp4",
      "file:///etc/passwd.mp4",
      "nada",
    ])
      await expect(exigirDestinoPublico(url), url).rejects.toThrow();
  });

  it("aceita IP público nas portas padrão", async () => {
    await expect(
      exigirDestinoPublico("https://8.8.8.8/v.mp4"),
    ).resolves.toBeInstanceOf(URL);
  });
});

describe("conexão só em endereço público", () => {
  it("a resolução de nome usada na conexão recusa nome que aponta para dentro", async () => {
    const erro = await new Promise<Error | null>((ok) =>
      resolverSoPublico("localhost", { all: true }, (e) => ok(e)),
    );
    expect(erro?.message).toMatch(/não é público/);
  });

  it("um servidor local nunca é alcançado, nem por nome", async () => {
    let chegou = false;
    const servidor = http.createServer((_req, res) => {
      chegou = true;
      res.end("segredo");
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const porta = (servidor.address() as { port: number }).port;
    try {
      // Pela porta já seria recusado; aqui o que se testa é a conexão em si.
      await expect(
        new Promise((ok, falha) => {
          const pedido = http.request(
            { host: "localhost", port: porta, lookup: resolverSoPublico },
            ok,
          );
          pedido.on("error", falha);
          pedido.end();
        }),
      ).rejects.toThrow(/não é público/);
      await expect(
        abrirDownloadSeguro(`http://127.0.0.1:${porta}/a.mp4`, {}),
      ).rejects.toThrow();
      expect(chegou).toBe(false);
    } finally {
      servidor.close();
    }
  });
});
