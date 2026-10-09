import type { CSSProperties, ReactNode } from "react";

/**
 * Cápsula da fábrica de creators. `real` mostra o creator pronto; `build` é a
 * cápsula ainda em construção (só a malha), o lugar do visitante.
 * `cx`/`base` são o centro horizontal e a linha do chão, em px do quadro.
 */
export function Capsula({
  cx,
  base,
  w,
  h,
  img,
  tipo = "real",
  num,
  nome,
  estado,
  dl = 0,
  hw = 0,
  reflexo = true,
}: {
  cx: number;
  base: number;
  w: number;
  h: number;
  img: string;
  tipo?: "real" | "build";
  num?: string;
  nome?: string;
  /** Linha de estado embaixo do nome (ex.: IDENTITY LOCKED). */
  estado?: ReactNode;
  /** Atraso, em segundos, para acender (dl) e para o hardware subir (hw). */
  dl?: number;
  hw?: number;
  reflexo?: boolean;
}) {
  const estilo = {
    left: cx - w / 2,
    top: base - h,
    "--w": `${w}px`,
    "--h": `${h}px`,
    "--dl": `${dl}s`,
    "--hw": `${hw}s`,
  } as CSSProperties;
  const mascara = `url('${img}')`;
  return (
    <div className={`cx-cap${tipo === "build" ? " build" : ""}`} style={estilo}>
      <div className="cx-tube">
        {tipo === "real" ? (
          <>
            <img className="cx-fig" src={img} alt={nome ?? ""} />
            <i className="cx-tint" />
          </>
        ) : (
          <i
            className="cx-wire"
            style={{ WebkitMaskImage: mascara, maskImage: mascara }}
          />
        )}
        <i className="cx-cone" />
        <i className="cx-scan" />
      </div>
      <div className="cx-gl">
        <i className="hl" />
      </div>
      <i className="cx-crown" />
      <i className="cx-strut l">
        <i />
      </i>
      <i className="cx-strut r">
        <i />
      </i>
      <div className="cx-base">
        <i className="ring" />
        <i className="body">{num ? <b>{num}</b> : null}</i>
        <i className="foot" />
      </div>
      {reflexo && tipo === "real" ? (
        <img className="cx-rf" src={img} alt="" />
      ) : null}
      {num ? (
        <div className="cx-tag">
          <em>{num}</em>
          <b>{nome}</b>
          <span>{estado}</span>
        </div>
      ) : null}
    </div>
  );
}
