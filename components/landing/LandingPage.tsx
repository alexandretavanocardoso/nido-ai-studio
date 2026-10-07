"use client";

import { useState } from "react";
import "./landing.css";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRecursos } from "@/components/RecursosProvider";

export function LandingPage() {
  return (
    <div className="landing-root">
      {/* Global grain + grid overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          mixBlendMode: "screen",
          opacity: 0.5,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 2,
          opacity: 0.06,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.9'/></svg>\")",
        }}
      />

      {/* ================= HEADER ================= */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          background: "rgba(5,5,5,0.72)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            maxWidth: 1600,
            margin: "0 auto",
            padding: "18px 32px",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                border: "1.5px solid #C7FF2E",
                display: "grid",
                placeItems: "center",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  background: "#C7FF2E",
                  boxShadow: "0 0 12px #C7FF2E",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.14em",
                lineHeight: 1.1,
              }}
            >
              <div style={{ fontWeight: 600 }}>CREATOR&nbsp;AI</div>
              <div style={{ opacity: 0.5, fontSize: 10 }}>by NIDO</div>
            </div>
          </div>
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: 36,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <a href="#produto" style={{ opacity: 0.75 }}>
              Produto
            </a>
            <a href="#creators" style={{ opacity: 0.75 }}>
              Creators
            </a>
            <a href="#engineer" style={{ opacity: 0.75 }}>
              Influencer Engineer
            </a>
            <a href="#nido" style={{ opacity: 0.75 }}>
              NIDO
            </a>
          </nav>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <a
              href="/auth/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 18px",
                background: "#C7FF2E",
                color: "#050505",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 600,
                border: "1px solid #C7FF2E",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: "#050505",
                  borderRadius: "50%",
                  animation: "landing-pulse-ring 2s infinite",
                }}
              />
              Entrar
            </a>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section
        style={{
          position: "relative",
          padding: "56px 32px 80px",
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
            gap: 56,
            alignItems: "start",
          }}
        >
          {/* LEFT: headline + CTA */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginBottom: 36,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: "#C7FF2E",
                  boxShadow: "0 0 10px #C7FF2E",
                }}
              />
              <span style={{ opacity: 0.75 }}>
                Creator OS / v0.1 — Private Alpha
              </span>
              <span
                style={{
                  flex: 1,
                  height: 1,
                  background: "rgba(255,255,255,0.1)",
                }}
              />
              <span style={{ opacity: 0.5 }}>PT-BR</span>
            </div>

            <h1
              style={{
                margin: 0,
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(48px, 7.4vw, 120px)",
                lineHeight: 0.92,
                letterSpacing: "-0.045em",
                textTransform: "uppercase",
              }}
            >
              Construa um
              <br />
              influenciador{" "}
              <span
                style={{
                  color: "#C7FF2E",
                  textShadow: "0 0 42px rgba(199,255,46,0.35)",
                }}
              >
                AI
              </span>
              <br />
              <span
                style={{ fontStyle: "italic", fontWeight: 500, opacity: 0.86 }}
              >
                a partir da
              </span>
              <br />
              sua criatividade.
            </h1>

            <p
              style={{
                maxWidth: 560,
                margin: "40px 0 0",
                fontSize: 19,
                lineHeight: 1.45,
                color: "rgba(245,245,242,0.72)",
                fontWeight: 400,
              }}
            >
              Crie identidade, personalidade, visual, voz e estratégia para
              personagens feitos para viver — e crescer — na internet.
            </p>

            <div
              style={{
                marginTop: 48,
                display: "flex",
                alignItems: "center",
                gap: 20,
                flexWrap: "wrap",
              }}
            >
              <a
                href="#comecar"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "20px 28px",
                  background: "#C7FF2E",
                  color: "#050505",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  border: "1px solid #C7FF2E",
                  boxShadow:
                    "0 0 0 1px rgba(199,255,46,0.25), 0 0 48px rgba(199,255,46,0.35)",
                }}
              >
                <span>Começar agora</span>
                <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                  <path
                    d="M1 6H15M15 6L10 1M15 6L10 11"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                </svg>
              </a>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  opacity: 0.6,
                }}
              >
                Seu primeiro creator será{" "}
                <span style={{ color: "#C7FF2E", opacity: 1 }}>grátis</span>.
              </div>
            </div>

            {/* Bottom spec row */}
            <div
              style={{
                marginTop: 72,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 0,
                borderTop: "1px solid rgba(255,255,255,0.1)",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              <div
                style={{
                  padding: "20px 0",
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.45,
                  }}
                >
                  01 / Build
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 14,
                    letterSpacing: "0.04em",
                  }}
                >
                  Identidade completa
                </div>
              </div>
              <div
                style={{
                  padding: "20px 0 20px 20px",
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.45,
                  }}
                >
                  02 / Operate
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 14,
                    letterSpacing: "0.04em",
                  }}
                >
                  Sem aparecer
                </div>
              </div>
              <div style={{ padding: "20px 0 20px 20px" }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.45,
                  }}
                >
                  03 / Scale
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 14,
                    letterSpacing: "0.04em",
                  }}
                >
                  Múltiplos creators
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: creator video stack */}
          <div style={{ position: "relative", height: 760 }}>
            {/* Floating tags */}
            <div
              style={{
                position: "absolute",
                top: 20,
                left: 0,
                zIndex: 5,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  padding: "6px 10px",
                  border: "1px solid #C7FF2E",
                  background: "rgba(199,255,46,0.08)",
                  color: "#C7FF2E",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    background: "#C7FF2E",
                    borderRadius: "50%",
                    animation: "landing-blink 1.4s infinite",
                  }}
                />
                Identity Locked
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  opacity: 0.75,
                }}
              >
                Voice · defined
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                top: 300,
                right: 0,
                zIndex: 5,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  padding: "6px 10px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(5,5,5,0.75)",
                  backdropFilter: "blur(8px)",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                Personality · 8 traits
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  border: "1px solid rgba(240,55,154,0.6)",
                  color: "#F0379A",
                  background: "rgba(240,55,154,0.08)",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Content Engine · ON
              </div>
            </div>

            <div
              style={{ position: "absolute", bottom: 20, left: 30, zIndex: 5 }}
            >
              <div
                style={{
                  padding: "6px 10px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(5,5,5,0.75)",
                  backdropFilter: "blur(8px)",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                Niche · humor + comportamento
              </div>
            </div>

            {/* Central 9:16 — Arnaldo Nitro portrait + dança energetica video */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 40,
                transform: "translateX(-50%)",
                width: 320,
                height: 568,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "#0A0A0A",
                overflow: "hidden",
                boxShadow:
                  "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(199,255,46,0.08)",
              }}
            >
              <video
                autoPlay
                muted
                loop
                playsInline
                poster="/landing/arnaldo-energetico.png"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              >
                <source src="/landing/arnaldo-danca.mp4" type="video/mp4" />
              </video>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: "60%",
                    background:
                      "linear-gradient(180deg, transparent 0%, rgba(199,255,46,0.06) 48%, rgba(199,255,46,0.1) 50%, rgba(199,255,46,0.06) 52%, transparent 100%)",
                    animation: "landing-scan 4.2s linear infinite",
                  }}
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  left: 14,
                  right: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    color: "#C7FF2E",
                    textShadow: "0 0 10px rgba(0,0,0,0.9)",
                  }}
                >
                  ● LIVE
                </span>
                <span
                  style={{
                    opacity: 0.8,
                    textShadow: "0 0 10px rgba(0,0,0,0.9)",
                  }}
                >
                  9:16
                </span>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: "24px 14px 14px",
                  background:
                    "linear-gradient(180deg, transparent, rgba(0,0,0,0.85))",
                }}
              >
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    opacity: 0.7,
                  }}
                >
                  Creator #001
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: "-0.02em",
                  }}
                >
                  ARNALDO NITRO
                </div>
              </div>
            </div>

            {/* Left partial 9:16 — Zé Zen */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 180,
                width: 180,
                height: 320,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#0A0A0A",
                overflow: "hidden",
                transform: "rotate(-4deg)",
                opacity: 0.85,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/ze-zen-pfp.png"
                alt="Zé Zen"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.75))",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  bottom: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                Creator #002
                <br />
                ZÉ ZEN
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  top: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: "#F0379A",
                }}
              >
                ● LIVE
              </div>
            </div>

            {/* Right partial 9:16 */}
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 420,
                width: 170,
                height: 300,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "linear-gradient(145deg, #0A0A0A, #141414)",
                overflow: "hidden",
                transform: "rotate(5deg)",
                opacity: 0.65,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/arnaldo-energetico.png"
                alt="Arnaldo Nitro"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85))",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  bottom: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  opacity: 0.5,
                }}
              >
                Creator #003
                <br />[ undefined ]
              </div>
            </div>

            {/* Scanning crosshair corners */}
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 56,
                height: 56,
                borderTop: "1px solid #C7FF2E",
                borderRight: "1px solid #C7FF2E",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: 56,
                height: 56,
                borderBottom: "1px solid #C7FF2E",
                borderLeft: "1px solid #C7FF2E",
              }}
            />
          </div>
        </div>

        {/* Bottom hero subhead */}
        <div
          style={{
            marginTop: 80,
            paddingTop: 32,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 24,
            justifyContent: "space-between",
            flexWrap: "wrap",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: "#C7FF2E" }}>
            // essas pessoas não existem.
          </span>
          <span style={{ opacity: 0.45 }}>↓ role para construir uma.</span>
        </div>
      </section>

      {/* ================= MANIFESTO ================= */}
      <section
        style={{
          position: "relative",
          padding: "160px 32px",
          maxWidth: 1600,
          margin: "0 auto",
          minHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.5,
            marginBottom: 48,
          }}
        >
          [ 01 ] &nbsp;·&nbsp; manifesto
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: "'Inter Tight', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(56px, 11vw, 180px)",
            lineHeight: 0.9,
            letterSpacing: "-0.05em",
            textTransform: "uppercase",
            maxWidth: 1500,
          }}
        >
          O próximo
          <br />
          <span
            style={{
              color: "#C7FF2E",
              textShadow: "0 0 60px rgba(199,255,46,0.3)",
            }}
          >
            MrBeast
          </span>
          <br />
          pode não ser
          <br />
          <span style={{ fontStyle: "italic", fontWeight: 500 }}>humano.</span>
        </h2>
        <div
          style={{
            marginTop: 64,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 40,
            flexWrap: "wrap",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 22,
              lineHeight: 1.4,
              maxWidth: 480,
              color: "rgba(245,245,242,0.72)",
            }}
          >
            Uma nova geração de creators está começando. Eles não têm corpo. Têm
            identidade.
          </p>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              opacity: 0.4,
            }}
          >
            v0.1 / observation #01
          </div>
        </div>
      </section>

      {/* ================= IDEA → CREATOR ================= */}
      <section
        id="produto"
        style={{
          position: "relative",
          padding: "120px 32px",
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 56,
            alignItems: "start",
            marginBottom: 80,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                opacity: 0.5,
                marginBottom: 24,
              }}
            >
              [ 02 ] &nbsp;·&nbsp; de uma ideia a um creator
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(42px, 5.4vw, 84px)",
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
                textTransform: "uppercase",
              }}
            >
              Uma frase.
              <br />
              Um creator
              <br />
              inteiro.
            </h2>
          </div>
          <div style={{ paddingTop: 20 }}>
            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.5,
                color: "rgba(245,245,242,0.7)",
                maxWidth: 440,
              }}
            >
              Você escreve uma ideia. O sistema constrói identidade, visual,
              personalidade, voz e nicho — camada por camada — até existir
              alguém que poderia estar na sua timeline.
            </p>
          </div>
        </div>

        {/* Flow */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0.005))",
          }}
        >
          {/* Row 1: INPUT */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                padding: "28px 24px",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.55,
                display: "flex",
                alignItems: "center",
              }}
            >
              <span style={{ color: "#C7FF2E", marginRight: 8 }}>▸</span> Input
            </div>
            <div
              style={{
                padding: "28px 32px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: "#C7FF2E",
                  fontSize: 14,
                }}
              >
                &gt;
              </span>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 15,
                  lineHeight: 1.5,
                }}
              >
                quero criar um personagem good vibes, meio hippie, que fale
                sobre a vida moderna com humor
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 16,
                    background: "#C7FF2E",
                    marginLeft: 4,
                    verticalAlign: "middle",
                    animation: "landing-blink 1s infinite",
                  }}
                />
              </span>
            </div>
          </div>

          {/* Row 2: NAME */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                padding: "28px 24px",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Identity
            </div>
            <div style={{ padding: "28px 32px" }}>
              <div
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(32px, 4.4vw, 64px)",
                  lineHeight: 1,
                  letterSpacing: "-0.035em",
                  textTransform: "uppercase",
                }}
              >
                Zé Zen{" "}
                <span
                  style={{
                    color: "rgba(245,245,242,0.3)",
                    fontWeight: 400,
                    fontStyle: "italic",
                  }}
                >
                  — the chill observer
                </span>
              </div>
            </div>
          </div>

          {/* Row 3: PERSONALITY */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                padding: "28px 24px",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Personality
            </div>
            <div
              style={{
                padding: "24px 32px",
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {["calmo", "irônico"].map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "8px 14px",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12,
                    letterSpacing: "0.08em",
                  }}
                >
                  {tag}
                </span>
              ))}
              <span
                style={{
                  padding: "8px 14px",
                  border: "1px solid #C7FF2E",
                  color: "#C7FF2E",
                  background: "rgba(199,255,46,0.06)",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                }}
              >
                good vibes
              </span>
              {["observador", "estranhamente sábio"].map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "8px 14px",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12,
                    letterSpacing: "0.08em",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Row 4: VISUAL */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                padding: "28px 24px",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Visual
            </div>
            <div
              style={{
                padding: "24px 32px",
                display: "flex",
                gap: 16,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 120,
                  height: 160,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "#0E0E0E",
                  position: "relative",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/ze-zen-pfp.png"
                  alt="Zé Zen"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  lineHeight: 1.8,
                  opacity: 0.7,
                }}
              >
                dreadlocks grisalhos · barba longa
                <br />
                óculos redondos roxo-fumê · quimono estampado
                <br />
                luz quente de festival · tom bronzeado
              </div>
            </div>
          </div>

          {/* Row 5: VOICE */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                padding: "28px 24px",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Voice
            </div>
            <div style={{ padding: "28px 32px" }}>
              <div
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "clamp(22px, 2.6vw, 36px)",
                  lineHeight: 1.2,
                  letterSpacing: "-0.02em",
                }}
              >
                "calma aí, meu consagrado…"
              </div>
            </div>
          </div>

          {/* Row 6: NICHE */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                padding: "28px 24px",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Niche
            </div>
            <div
              style={{
                padding: "28px 32px",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 14,
                letterSpacing: "0.08em",
              }}
            >
              humor &nbsp;/&nbsp; comportamento &nbsp;/&nbsp; vida moderna
            </div>
          </div>

          {/* Row 7: READY */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              background: "rgba(199,255,46,0.04)",
            }}
          >
            <div
              style={{
                padding: "28px 24px",
                borderRight: "1px solid rgba(199,255,46,0.2)",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#C7FF2E",
              }}
            >
              ✓ Ready
            </div>
            <div
              style={{
                padding: "28px 32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 24,
              }}
            >
              <div
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontWeight: 700,
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                }}
              >
                Creator <span style={{ color: "#C7FF2E" }}>#004 — Zé Zen</span>{" "}
                salvo no sistema
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  opacity: 0.6,
                }}
              >
                0:52 total
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CHARACTER VS CREATOR ================= */}
      <section
        style={{
          position: "relative",
          padding: "140px 32px",
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.5,
            marginBottom: 36,
          }}
        >
          [ 03 ] &nbsp;·&nbsp; a tese
        </div>
        <h2
          style={{
            margin: "0 0 80px",
            fontFamily: "'Inter Tight', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(48px, 8vw, 128px)",
            lineHeight: 0.9,
            letterSpacing: "-0.045em",
            textTransform: "uppercase",
            maxWidth: 1300,
          }}
        >
          Uma imagem
          <br />
          não é um <span style={{ color: "#C7FF2E" }}>creator</span>.
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* LEFT: character generator */}
          <div
            style={{
              background: "#080808",
              padding: "48px 40px",
              minHeight: 640,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  opacity: 0.45,
                  marginBottom: 32,
                }}
              >
                AI Character Generator
              </div>
              <div
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontWeight: 700,
                  fontSize: "clamp(28px, 3.2vw, 44px)",
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  textTransform: "uppercase",
                  opacity: 0.7,
                }}
              >
                Personagens
                <br />
                são gerados.
              </div>
            </div>
            <div
              style={{
                margin: "48px auto",
                width: 220,
                height: 300,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "linear-gradient(160deg, #111, #1a1a1a)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.08), transparent 70%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  opacity: 0.5,
                }}
              >
                [ 1024 × 1024 .png ]
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                opacity: 0.5,
              }}
            >
              <span
                style={{
                  padding: "8px 12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                prompt
              </span>
              <span
                style={{
                  padding: "8px 12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                image
              </span>
              <span
                style={{
                  padding: "8px 12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                download
              </span>
            </div>
          </div>

          {/* RIGHT: creator ai */}
          <div
            style={{
              background: "#060606",
              padding: "48px 40px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse at 80% 20%, rgba(199,255,46,0.08), transparent 60%)",
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#C7FF2E",
                  marginBottom: 32,
                }}
              >
                Creator AI by NIDO
              </div>
              <div
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontWeight: 700,
                  fontSize: "clamp(28px, 3.2vw, 44px)",
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  textTransform: "uppercase",
                }}
              >
                Creators
                <br />
                são construídos.
              </div>
              <div
                style={{
                  marginTop: 48,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 10,
                }}
              >
                {[
                  "identity",
                  "visual",
                  "personality",
                  "voice",
                  "language",
                  "niche",
                  "strategy",
                  "monetization",
                  "content",
                  "memory",
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      padding: "14px 16px",
                      border: "1px solid rgba(199,255,46,0.25)",
                      background: "rgba(199,255,46,0.04)",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 12,
                      letterSpacing: "0.1em",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ opacity: 0.7 }}>{item}</span>
                    <span style={{ color: "#C7FF2E" }}>✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 48,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 32,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: "'Inter Tight', sans-serif",
              fontStyle: "italic",
              fontSize: 22,
              lineHeight: 1.4,
              maxWidth: 640,
              color: "rgba(245,245,242,0.7)",
            }}
          >
            Personagens têm aparência. Creators têm identidade, voz, universo,
            estratégia, conteúdo e audiência.
          </div>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              opacity: 0.5,
            }}
          >
            ↓ 7 camadas →
          </div>
        </div>
      </section>

      {/* ================= 7-LAYER BUILDER ================= */}
      <section
        style={{
          position: "relative",
          padding: "140px 32px",
          background: "#080808",
        }}
      >
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 36,
            }}
          >
            [ 04 ] &nbsp;·&nbsp; wizard
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 40,
              alignItems: "end",
              marginBottom: 72,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(44px, 6.4vw, 104px)",
                lineHeight: 0.9,
                letterSpacing: "-0.045em",
                textTransform: "uppercase",
              }}
            >
              Construindo uma
              <br />
              pessoa, <span style={{ color: "#C7FF2E" }}>camada</span>
              <br />
              por camada.
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.5,
                color: "rgba(245,245,242,0.7)",
                maxWidth: 460,
                paddingBottom: 12,
              }}
            >
              Sete etapas estruturadas. Em cada uma, você constrói manualmente
              ou gera com AI. No fim do processo, existe um creator — não um
              asset.
            </p>
          </div>

          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              gap: 0,
              border: "1px solid rgba(255,255,255,0.14)",
              width: "fit-content",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: 56,
            }}
          >
            <div
              style={{
                padding: "14px 22px",
                background: "#C7FF2E",
                color: "#050505",
                fontWeight: 700,
              }}
            >
              ▸ Generate with AI
            </div>
            <div
              style={{
                padding: "14px 22px",
                opacity: 0.6,
                borderLeft: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              Build it yourself
            </div>
          </div>

          {/* Timeline */}
          <div
            style={{
              position: "relative",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#050505",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 72,
                left: 0,
                right: 0,
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(199,255,46,0.3) 20%, rgba(199,255,46,0.3) 80%, transparent)",
                zIndex: 1,
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                position: "relative",
                zIndex: 2,
              }}
            >
              {[
                {
                  n: "01",
                  title: "Identidade",
                  sub: "nome · arquétipo · história",
                  dot: "filled",
                },
                {
                  n: "02",
                  title: "Visual",
                  sub: "rosto · corpo · estilo · luz",
                  dot: "filled",
                },
                {
                  n: "03",
                  title: "Personalidade",
                  sub: "traços · gostos · defeitos",
                  dot: "filled",
                },
                {
                  n: "04 · now",
                  title: "Nicho & Estratégia",
                  sub: "categoria · público · posicionamento",
                  dot: "now",
                  now: true,
                },
                {
                  n: "05",
                  title: "Voz & Linguagem",
                  sub: "tom · bordões · ritmo",
                  dot: "empty",
                },
                {
                  n: "06",
                  title: "Monetização & Marcas",
                  sub: "brand fit · modelos",
                  dot: "empty",
                },
                {
                  n: "07",
                  title: "Revisão & Export",
                  sub: "character sheet · save",
                  dot: "empty",
                },
              ].map((step, i, arr) => (
                <div
                  key={step.n}
                  style={{
                    padding: "32px 20px",
                    borderRight:
                      i < arr.length - 1
                        ? "1px solid rgba(255,255,255,0.08)"
                        : undefined,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 20,
                    background: step.now ? "rgba(199,255,46,0.03)" : undefined,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      opacity: step.now ? 1 : 0.5,
                      color: step.now ? "#C7FF2E" : undefined,
                    }}
                  >
                    {step.n}
                  </div>
                  <div
                    style={
                      step.dot === "empty"
                        ? {
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            border: "1.5px solid rgba(255,255,255,0.2)",
                          }
                        : step.dot === "now"
                          ? {
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              background: "#C7FF2E",
                              animation: "landing-pulse-ring 2s infinite",
                            }
                          : {
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              background: "#C7FF2E",
                              boxShadow:
                                i === 0
                                  ? "0 0 20px rgba(199,255,46,0.5)"
                                  : undefined,
                            }
                    }
                  />
                  <div
                    style={{
                      fontFamily: "'Inter Tight', sans-serif",
                      fontWeight: 700,
                      fontSize: 18,
                      lineHeight: 1.1,
                      letterSpacing: "-0.02em",
                      textTransform: "uppercase",
                      opacity: step.dot === "empty" ? 0.7 : 1,
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      opacity: step.now
                        ? 0.7
                        : step.dot === "empty"
                          ? 0.4
                          : 0.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {step.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Live step detail panel */}
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                padding: "48px 40px",
                background: "#050505",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 40,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                    marginBottom: 16,
                  }}
                >
                  Current step · live
                </div>
                <div
                  style={{
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 700,
                    fontSize: 36,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  Nicho &amp; Estratégia
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                    marginBottom: 16,
                  }}
                >
                  Primary niche
                </div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 14,
                    lineHeight: 1.8,
                  }}
                >
                  → humor
                  <br />
                  → comportamento
                  <br />→ vida moderna
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                    marginBottom: 16,
                  }}
                >
                  Audience target
                </div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 14,
                    lineHeight: 1.8,
                  }}
                >
                  → 18–34 BR
                  <br />
                  → irreverente / internet native
                  <br />→ formato: short-form vertical
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CREATOR ID CARD ================= */}
      <section
        style={{
          position: "relative",
          padding: "160px 32px",
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.5,
            marginBottom: 36,
          }}
        >
          [ 05 ] &nbsp;·&nbsp; creator identity file
        </div>
        <h2
          style={{
            margin: "0 0 72px",
            fontFamily: "'Inter Tight', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(44px, 6.4vw, 104px)",
            lineHeight: 0.9,
            letterSpacing: "-0.045em",
            textTransform: "uppercase",
          }}
        >
          Essa pessoa foi
          <br />
          <span style={{ color: "#C7FF2E" }}>construída.</span>
        </h2>

        {/* ID card */}
        <div
          style={{
            border: "1px solid rgba(199,255,46,0.3)",
            background: "#060606",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              width: 20,
              height: 20,
              borderTop: "1px solid #C7FF2E",
              borderLeft: "1px solid #C7FF2E",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 20,
              height: 20,
              borderTop: "1px solid #C7FF2E",
              borderRight: "1px solid #C7FF2E",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              width: 20,
              height: 20,
              borderBottom: "1px solid #C7FF2E",
              borderLeft: "1px solid #C7FF2E",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 12,
              right: 12,
              width: 20,
              height: 20,
              borderBottom: "1px solid #C7FF2E",
              borderRight: "1px solid #C7FF2E",
            }}
          />

          <div
            style={{
              padding: "20px 32px",
              borderBottom: "1px solid rgba(199,255,46,0.3)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ color: "#C7FF2E" }}>● CLASSIFIED</span>
              <span style={{ opacity: 0.5 }}>CREATOR OS / NIDO</span>
            </div>
            <div style={{ opacity: 0.5 }}>file ID — 00000001-NDO-ARNALDO</div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "440px 1fr",
              gap: 1,
              background: "rgba(199,255,46,0.1)",
            }}
          >
            {/* Portrait panel */}
            <div
              style={{
                background: "#040404",
                padding: 32,
                position: "relative",
                minHeight: 620,
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "3/4",
                  border: "1px solid rgba(199,255,46,0.3)",
                  background: "#0e0e0e",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/arnaldo-energetico.png"
                  alt="Arnaldo Nitro"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: "40%",
                      background:
                        "linear-gradient(180deg, transparent, rgba(199,255,46,0.1), transparent)",
                      animation: "landing-scan 5s linear infinite",
                    }}
                  />
                </div>
                <div
                  style={{
                    position: "absolute",
                    inset: 20,
                    border: "1px dashed rgba(199,255,46,0.35)",
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 14,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: "#C7FF2E",
                    textShadow: "0 0 8px rgba(0,0,0,0.9)",
                  }}
                >
                  ● SCANNING
                </div>
                <div
                  style={{
                    position: "absolute",
                    bottom: 10,
                    right: 14,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: "#C7FF2E",
                    textShadow: "0 0 8px rgba(0,0,0,0.9)",
                  }}
                >
                  creator #001
                </div>
              </div>
              <div
                style={{
                  marginTop: 20,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  opacity: 0.5,
                }}
              >
                <div>
                  Face hash
                  <br />
                  <span style={{ color: "#C7FF2E", opacity: 1 }}>
                    0xFA7E · 9E2C
                  </span>
                </div>
                <div>
                  Scan date
                  <br />
                  <span style={{ color: "#F5F5F2", opacity: 1 }}>
                    2025.10.01
                  </span>
                </div>
              </div>
            </div>

            {/* Data panel */}
            <div style={{ background: "#060606", padding: "32px 40px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 32,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      opacity: 0.5,
                    }}
                  >
                    Creator ID #0001
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      fontFamily: "'Inter Tight', sans-serif",
                      fontWeight: 800,
                      fontSize: "clamp(42px, 5vw, 72px)",
                      lineHeight: 0.9,
                      letterSpacing: "-0.035em",
                      textTransform: "uppercase",
                    }}
                  >
                    Arnaldo <span style={{ color: "#C7FF2E" }}>Nitro</span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: "'Inter Tight', sans-serif",
                      fontStyle: "italic",
                      fontSize: 20,
                      opacity: 0.7,
                    }}
                  >
                    — the night-shift showman
                  </div>
                </div>
                <div
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #C7FF2E",
                    color: "#C7FF2E",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  ● Active
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 0,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {[
                  { label: "Archetype", value: "The chaotic entertainer" },
                  {
                    label: "Personality",
                    value: "loud · magnético · bagunceiro · carismático",
                  },
                  {
                    label: "Language",
                    value: "Brazilian internet culture / 2020s",
                  },
                  {
                    label: "Niche",
                    value: "Lifestyle · noite · humor absurdo",
                  },
                  { label: "Voice", value: "Defined", accent: true },
                  { label: "Visual ID", value: "Locked", accent: true },
                  { label: "Monetization", value: "Defined" },
                  { label: "Brand fit", value: "Defined" },
                ].map((cell, i) => (
                  <div
                    key={cell.label}
                    style={{
                      padding:
                        i % 2 === 0 ? "20px 20px 20px 0" : "20px 0 20px 24px",
                      borderRight:
                        i % 2 === 0
                          ? "1px solid rgba(255,255,255,0.08)"
                          : undefined,
                      borderBottom:
                        i < 6 ? "1px solid rgba(255,255,255,0.08)" : undefined,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        opacity: 0.45,
                        marginBottom: 6,
                      }}
                    >
                      {cell.label}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        color: cell.accent ? "#C7FF2E" : undefined,
                      }}
                    >
                      {cell.value}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 28,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(199,255,46,0.2)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                <span style={{ opacity: 0.5 }}>
                  ↳ this creator persists across sessions
                </span>
                <span style={{ color: "#C7FF2E" }}>signature · verified ✓</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CHARACTER SHEET / CONSISTENCY ================= */}
      <section
        style={{
          position: "relative",
          padding: "140px 32px",
          background: "#080808",
        }}
      >
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 36,
            }}
          >
            [ 06 ] &nbsp;·&nbsp; character sheet
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 56,
              alignItems: "end",
              marginBottom: 72,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(48px, 8vw, 128px)",
                lineHeight: 0.88,
                letterSpacing: "-0.045em",
                textTransform: "uppercase",
              }}
            >
              Um rosto.
              <br />
              <span style={{ color: "#C7FF2E" }}>Infinitas</span>
              <br />
              histórias.
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.5,
                color: "rgba(245,245,242,0.7)",
                maxWidth: 440,
                paddingBottom: 20,
              }}
            >
              Cada creator tem uma referência visual consistente — ângulos,
              expressões, luz — para continuar aparecendo em diferentes
              conteúdos sem perder a identidade.
            </p>
          </div>

          <div
            style={{
              position: "relative",
              border: "1px solid rgba(199,255,46,0.25)",
              background: "#060606",
              overflow: "hidden",
              boxShadow:
                "0 20px 60px rgba(0,0,0,0.5), 0 0 60px rgba(199,255,46,0.06)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                width: 18,
                height: 18,
                borderTop: "1px solid #C7FF2E",
                borderLeft: "1px solid #C7FF2E",
                zIndex: 3,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 18,
                height: 18,
                borderTop: "1px solid #C7FF2E",
                borderRight: "1px solid #C7FF2E",
                zIndex: 3,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                width: 18,
                height: 18,
                borderBottom: "1px solid #C7FF2E",
                borderLeft: "1px solid #C7FF2E",
                zIndex: 3,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 10,
                right: 10,
                width: 18,
                height: 18,
                borderBottom: "1px solid #C7FF2E",
                borderRight: "1px solid #C7FF2E",
                zIndex: 3,
              }}
            />

            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid rgba(199,255,46,0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ color: "#C7FF2E" }}>● character sheet</span>
                <span style={{ opacity: 0.5 }}>
                  creator #003 — Nino Pirulito
                </span>
              </div>
              <div style={{ opacity: 0.5 }}>
                5 angles · 4 expressions · locked
              </div>
            </div>
            <div style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/nino-pirulito-card.png"
                alt="Nino Pirulito character sheet"
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: "20%",
                    background:
                      "linear-gradient(180deg, transparent, rgba(199,255,46,0.08), transparent)",
                    animation: "landing-scan 7s linear infinite",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                padding: "18px 24px",
                borderTop: "1px solid rgba(199,255,46,0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                opacity: 0.6,
              }}
            >
              <span>
                front · 3/4 · side · back-3/4 · back &nbsp;//&nbsp; expressions
                · close-up
              </span>
              <span style={{ color: "#C7FF2E", opacity: 1 }}>
                identity lock ✓
              </span>
            </div>
          </div>

          {/* Spec row */}
          <div
            style={{
              marginTop: 32,
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {[
              { label: "Consistency score", value: "98.4%", accent: true },
              { label: "Reference angles", value: "06" },
              { label: "Lighting setups", value: "04" },
              { label: "Identity lock", value: "✓ locked", accent: true },
            ].map((cell, i) => (
              <div
                key={cell.label}
                style={{
                  padding: i === 0 ? "18px 0" : "18px 0 18px 24px",
                  borderRight:
                    i < 3 ? "1px solid rgba(255,255,255,0.08)" : undefined,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.45,
                  }}
                >
                  {cell.label}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 20,
                    color: cell.accent ? "#C7FF2E" : undefined,
                  }}
                >
                  {cell.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= SHADOW ================= */}
      <section
        style={{
          position: "relative",
          padding: "160px 32px",
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.5,
            marginBottom: 36,
          }}
        >
          [ 07 ] &nbsp;·&nbsp; shadow
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 56,
            alignItems: "end",
            marginBottom: 64,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "'Inter Tight', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(48px, 7.4vw, 120px)",
              lineHeight: 0.88,
              letterSpacing: "-0.045em",
              textTransform: "uppercase",
            }}
          >
            Roube o<br />
            <span style={{ color: "#C7FF2E" }}>movimento.</span>
            <br />
            Não a identidade.
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 18,
              lineHeight: 1.5,
              color: "rgba(245,245,242,0.7)",
              maxWidth: 440,
              paddingBottom: 20,
            }}
          >
            Pegue qualquer vídeo. Substitua a pessoa pelo seu creator. O
            movimento permanece. A identidade é a sua.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 72px 1fr",
            gap: 0,
            alignItems: "center",
          }}
        >
          {/* Original video — reference */}
          <div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.5,
                marginBottom: 14,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>input · original video</span>
              <span>9:16</span>
            </div>
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 380,
                aspectRatio: "9/16",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "#0E0E0E",
                overflow: "hidden",
              }}
            >
              <video
                autoPlay
                muted
                loop
                playsInline
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              >
                <source src="/landing/shadow-source.mp4" type="video/mp4" />
              </video>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  top: 12,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textShadow: "0 0 8px rgba(0,0,0,0.9)",
                }}
              >
                ● source
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  opacity: 0.85,
                  textShadow: "0 0 8px rgba(0,0,0,0.9)",
                }}
              >
                reference clip
              </div>
            </div>
          </div>

          {/* Transformation icon */}
          <div
            style={{ display: "grid", placeItems: "center", height: "100%" }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                border: "1px solid #C7FF2E",
                display: "grid",
                placeItems: "center",
                background: "rgba(199,255,46,0.06)",
                position: "relative",
              }}
            >
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                <path
                  d="M4 15H26M26 15L19 8M26 15L19 22"
                  stroke="#C7FF2E"
                  strokeWidth="1.6"
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  inset: -2,
                  border: "1px solid rgba(199,255,46,0.3)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: -22,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#C7FF2E",
                  whiteSpace: "nowrap",
                }}
              >
                SHADOW
              </div>
            </div>
          </div>

          {/* Transformed video */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: "100%", maxWidth: 380 }}>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#C7FF2E",
                }}
              >
                <span>output · your creator</span>
                <span>9:16</span>
              </div>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "9/16",
                  border: "1px solid #C7FF2E",
                  background: "#0E0E0E",
                  overflow: "hidden",
                  boxShadow: "0 0 60px rgba(199,255,46,0.15)",
                }}
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="/landing/arnaldo-energetico.png"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                >
                  <source src="/landing/arnaldo-danca.mp4" type="video/mp4" />
                </video>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: "50%",
                      background:
                        "linear-gradient(180deg, transparent, rgba(199,255,46,0.08), transparent)",
                      animation: "landing-scan 4s linear infinite",
                    }}
                  />
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    top: 12,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    color: "#C7FF2E",
                    textShadow: "0 0 8px rgba(0,0,0,0.9)",
                  }}
                >
                  ● identity swap
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    bottom: 12,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textShadow: "0 0 8px rgba(0,0,0,0.9)",
                  }}
                >
                  Arnaldo Nitro · same motion
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 56,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ opacity: 0.55 }}>
            // qualquer movimento. seu creator.
          </span>
          <span style={{ opacity: 0.35 }}>beta feature</span>
        </div>
      </section>

      {/* ================= VIDEO PROMPTS ================= */}
      <section
        style={{
          position: "relative",
          padding: "140px 32px",
          background: "#080808",
        }}
      >
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 36,
            }}
          >
            [ 08 ] &nbsp;·&nbsp; prompt studio
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 56,
              alignItems: "end",
              marginBottom: 72,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(42px, 6vw, 96px)",
                lineHeight: 0.9,
                letterSpacing: "-0.04em",
                textTransform: "uppercase",
              }}
            >
              Da identidade,
              <br />
              para a <span style={{ color: "#C7FF2E" }}>cena.</span>
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.5,
                color: "rgba(245,245,242,0.7)",
                maxWidth: 440,
                paddingBottom: 12,
              }}
            >
              Transforme seu creator em prompts prontos para gerar vídeo em
              outras ferramentas — mantendo identidade, mood e linguagem.
            </p>
          </div>

          <div
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#050505",
              display: "grid",
              gridTemplateColumns: "1.3fr 1fr",
              gap: 1,
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          >
            {/* Left: form */}
            <div style={{ background: "#050505", padding: 32 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 24,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                }}
              >
                <span style={{ opacity: 0.55 }}>prompt_studio.v1</span>
                <span style={{ color: "#C7FF2E" }}>● connected to zé zen</span>
              </div>

              <div style={{ display: "grid", gap: 20 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    gap: 16,
                    alignItems: "center",
                    paddingBottom: 16,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      opacity: 0.55,
                    }}
                  >
                    Creator
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#0e0e0e",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/landing/ze-zen-pfp.png"
                        alt="Zé Zen"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontFamily: "'Inter Tight', sans-serif",
                        fontWeight: 600,
                        fontSize: 15,
                      }}
                    >
                      Zé Zen
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        opacity: 0.5,
                      }}
                    >
                      #002
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    gap: 16,
                    alignItems: "start",
                    paddingBottom: 16,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      opacity: 0.55,
                      paddingTop: 10,
                    }}
                  >
                    Scene
                  </div>
                  <div
                    style={{
                      padding: "14px 16px",
                      border: "1px solid rgba(199,255,46,0.3)",
                      background: "rgba(199,255,46,0.03)",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: "#C7FF2E" }}>&gt;</span> dançando
                    sozinho em uma rave às 4AM
                    <span
                      style={{
                        display: "inline-block",
                        width: 7,
                        height: 14,
                        background: "#C7FF2E",
                        marginLeft: 4,
                        verticalAlign: "middle",
                        animation: "landing-blink 1s infinite",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    gap: 16,
                    alignItems: "center",
                    paddingBottom: 16,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      opacity: 0.55,
                    }}
                  >
                    Camera
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span
                      style={{
                        padding: "8px 12px",
                        border: "1px solid #C7FF2E",
                        color: "#C7FF2E",
                        background: "rgba(199,255,46,0.05)",
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        letterSpacing: "0.1em",
                      }}
                    >
                      handheld
                    </span>
                    {["tripod", "drone", "dolly"].map((opt) => (
                      <span
                        key={opt}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid rgba(255,255,255,0.14)",
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          letterSpacing: "0.1em",
                          opacity: 0.6,
                        }}
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
                    gap: 16,
                    alignItems: "center",
                    paddingBottom: 20,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      opacity: 0.55,
                    }}
                  >
                    Mood
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["chaotic", "euphoric"].map((m) => (
                      <span
                        key={m}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #C7FF2E",
                          color: "#C7FF2E",
                          background: "rgba(199,255,46,0.05)",
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                        }}
                      >
                        {m}
                      </span>
                    ))}
                    {["melancholic", "cinematic"].map((m) => (
                      <span
                        key={m}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid rgba(255,255,255,0.14)",
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          opacity: 0.6,
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  style={{
                    marginTop: 8,
                    padding: "18px 24px",
                    background: "#C7FF2E",
                    color: "#050505",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <span>▸ Generate prompt</span>
                  <span style={{ opacity: 0.6 }}>⌘ ↵</span>
                </button>
              </div>
            </div>

            {/* Right: output */}
            <div
              style={{
                background: "#040404",
                padding: 32,
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 24,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                }}
              >
                <span style={{ opacity: 0.55 }}>output · prompt</span>
                <span style={{ color: "#C7FF2E" }}>✓ ready to copy</span>
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: "#F5F5F2",
                }}
              >
                <span style={{ color: "#C7FF2E" }}>[identity]</span> brazilian
                male, mid-30s, calm hippie-coded appearance, long wavy hair,
                round glasses, worn t-shirt, warm skin tone.
                <br />
                <br />
                <span style={{ color: "#C7FF2E" }}>[scene]</span> dancing alone
                inside a dim rave at 4am, strobe lights flickering lime and
                magenta, crowd blurred behind him.
                <br />
                <br />
                <span style={{ color: "#C7FF2E" }}>[camera]</span> handheld,
                24mm, slight shoulder shake, low shutter.
                <br />
                <br />
                <span style={{ color: "#C7FF2E" }}>[mood]</span> chaotic,
                euphoric, dream-like, warm film grain.
                <br />
                <br />
                <span style={{ color: "#C7FF2E" }}>[voice]</span> brazilian
                internet culture — slow, ironic, calm.
                <br />
                <br />
                <span style={{ opacity: 0.5 }}>
                  — export: Runway · Pika · Kling · Sora
                </span>
              </div>
              <div
                style={{
                  position: "absolute",
                  right: 16,
                  bottom: 16,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  opacity: 0.4,
                }}
              >
                478 tokens
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.14em",
              opacity: 0.4,
            }}
          >
            * geração de vídeo é feita em ferramentas de terceiros. Creator AI
            organiza o prompt a partir da identidade salva.
          </div>
        </div>
      </section>

      {/* ================= REAL CREATORS ================= */}
      <section
        id="creators"
        style={{ position: "relative", padding: "140px 0 100px" }}
      >
        <div
          style={{ maxWidth: 1600, margin: "0 auto 56px", padding: "0 32px" }}
        >
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 36,
            }}
          >
            [ 09 ] &nbsp;·&nbsp; real creators
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 56,
              alignItems: "end",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(56px, 10vw, 160px)",
                lineHeight: 0.88,
                letterSpacing: "-0.05em",
                textTransform: "uppercase",
              }}
            >
              They don't
              <br />
              exist.
              <br />
              <span
                style={{
                  color: "#C7FF2E",
                  fontStyle: "italic",
                  fontWeight: 500,
                }}
              >
                but their content does.
              </span>
            </h2>
            <div style={{ paddingBottom: 24 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 18,
                  lineHeight: 1.5,
                  color: "rgba(245,245,242,0.7)",
                  maxWidth: 420,
                }}
              >
                Dois dos nossos primeiros creators sintéticos, construídos
                dentro da Creator AI. Mais virão.
              </p>
              <div
                style={{
                  marginTop: 20,
                  display: "flex",
                  gap: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #C7FF2E",
                    color: "#C7FF2E",
                  }}
                >
                  ARNALDO NITRO
                </span>
                <span
                  style={{
                    padding: "6px 10px",
                    border: "1px solid rgba(255,255,255,0.14)",
                    opacity: 0.7,
                  }}
                >
                  ZÉ ZEN
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Horizontal creator rail */}
        <div
          style={{
            overflow: "hidden",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: "40px 0",
            background: "#060606",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 24,
              width: "max-content",
              animation: "landing-marquee 60s linear infinite",
              padding: "0 24px",
            }}
          >
            {Array.from({ length: 2 })
              .flatMap((_, setIdx) =>
                [
                  {
                    img: "/landing/arnaldo-energetico.png",
                    name: "ARNALDO NITRO",
                    tag: "● #001",
                    tagColor: "#C7FF2E",
                    sub: "noite · humor · lifestyle",
                  },
                  {
                    img: "/landing/ze-zen-pfp.png",
                    name: "ZÉ ZEN",
                    tag: "● #002",
                    tagColor: "#F0379A",
                    sub: "humor · comportamento",
                  },
                  {
                    img: "/landing/arnaldo-energetico.png",
                    name: "ARNALDO NITRO",
                    tag: "● #001 · clip 02",
                    tagColor: undefined,
                    sub: "[ video placeholder ]",
                  },
                  {
                    img: "/landing/ze-zen-pfp.png",
                    name: "ZÉ ZEN",
                    tag: "● #002 · clip 02",
                    tagColor: undefined,
                    sub: "[ video placeholder ]",
                  },
                  {
                    img: "/landing/arnaldo-energetico.png",
                    name: "ARNALDO NITRO",
                    tag: "● #001 · pinned",
                    tagColor: "#C7FF2E",
                    sub: "30K+ views · 5 days",
                    pinned: true,
                  },
                  {
                    img: "/landing/ze-zen-pfp.png",
                    name: "ZÉ ZEN",
                    tag: "● #002 · clip 03",
                    tagColor: "#F0379A",
                    sub: "[ video placeholder ]",
                  },
                ].map((card, i) => ({ ...card, key: `${setIdx}-${i}` })),
              )
              .map((card) => (
                <div
                  key={card.key}
                  style={{
                    width: 280,
                    height: 500,
                    flexShrink: 0,
                    border: card.pinned
                      ? "1px solid rgba(199,255,46,0.3)"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: "linear-gradient(160deg, #0E0E0E, #181818)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.img}
                    alt={card.name}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85))",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: 12,
                      top: 12,
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      color: card.tagColor,
                      opacity: card.tagColor ? 1 : 0.5,
                    }}
                  >
                    {card.tag}
                  </div>
                  <div style={{ position: "absolute", left: 12, bottom: 12 }}>
                    <div
                      style={{
                        fontFamily: "'Inter Tight', sans-serif",
                        fontWeight: 700,
                        fontSize: 20,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {card.name}
                    </div>
                    <div
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        opacity: 0.5,
                      }}
                    >
                      {card.sub}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* ================= ARNALDO CASE ================= */}
      <section
        style={{
          position: "relative",
          padding: "140px 32px",
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.5,
            marginBottom: 36,
          }}
        >
          [ 10 ] &nbsp;·&nbsp; first case
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 56,
            alignItems: "start",
            marginBottom: 80,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#C7FF2E",
                marginBottom: 20,
              }}
            >
              AI Creator #001
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(56px, 9vw, 144px)",
                lineHeight: 0.88,
                letterSpacing: "-0.05em",
                textTransform: "uppercase",
              }}
            >
              Arnaldo
              <br />
              Nitro.
            </h2>
            <p
              style={{
                margin: "32px 0 0",
                fontSize: 20,
                lineHeight: 1.4,
                color: "rgba(245,245,242,0.78)",
                maxWidth: 500,
              }}
            >
              Arnaldo não existe. Mas em cinco dias, mais de trinta mil
              visualizações passaram pelo conteúdo dele.
            </p>
          </div>

          {/* Metrics */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 0,
              borderTop: "1px solid rgba(255,255,255,0.1)",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {[
              { label: "Views acumuladas", value: "30K+", accent: true },
              { label: "Tempo decorrido", value: "5", unit: "days" },
              { label: "Followers", value: "50" },
            ].map((metric, i) => (
              <div
                key={metric.label}
                style={{
                  padding: "28px 0",
                  borderBottom:
                    i < 2 ? "1px solid rgba(255,255,255,0.08)" : undefined,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "baseline",
                  gap: 20,
                }}
              >
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.55,
                  }}
                >
                  {metric.label}
                </div>
                <div
                  style={{
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 800,
                    fontSize: "clamp(48px, 6vw, 88px)",
                    lineHeight: 1,
                    letterSpacing: "-0.045em",
                    color: metric.accent ? "#C7FF2E" : undefined,
                  }}
                >
                  {metric.value}{" "}
                  {metric.unit && (
                    <span
                      style={{
                        fontSize: "0.5em",
                        opacity: 0.6,
                        fontWeight: 500,
                      }}
                    >
                      {metric.unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content pieces */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
            gap: 20,
          }}
        >
          {/* Featured video */}
          <div
            style={{
              position: "relative",
              aspectRatio: "9/16",
              border: "1px solid #C7FF2E",
              background: "#0E0E0E",
              overflow: "hidden",
              boxShadow:
                "0 20px 60px rgba(0,0,0,0.5), 0 0 60px rgba(199,255,46,0.15)",
            }}
          >
            <video
              autoPlay
              muted
              loop
              playsInline
              poster="/landing/arnaldo-energetico.png"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            >
              <source src="/landing/arnaldo-danca.mp4" type="video/mp4" />
            </video>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 25%, transparent 60%, rgba(0,0,0,0.85))",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: "40%",
                  background:
                    "linear-gradient(180deg, transparent, rgba(199,255,46,0.08), transparent)",
                  animation: "landing-scan 6s linear infinite",
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                right: 12,
                display: "flex",
                justifyContent: "space-between",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  color: "#C7FF2E",
                  textShadow: "0 0 8px rgba(0,0,0,0.9)",
                }}
              >
                ● featured
              </span>
              <span
                style={{ opacity: 0.9, textShadow: "0 0 8px rgba(0,0,0,0.9)" }}
              >
                22.6K views
              </span>
            </div>
            <div style={{ position: "absolute", left: 16, bottom: 16 }}>
              <div
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontWeight: 700,
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                }}
              >
                ARNALDO NITRO
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  opacity: 0.8,
                  marginTop: 4,
                }}
              >
                best-performing clip
              </div>
            </div>
          </div>

          {/* Column 2 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                flex: 1,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#0E0E0E",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/arnaldo-energetico.png"
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "50% 20%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85))",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  bottom: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                }}
              >
                clip 02
              </div>
            </div>
            <div
              style={{
                flex: 1,
                border: "1px solid rgba(199,255,46,0.4)",
                background: "#0E0E0E",
                position: "relative",
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 0 32px rgba(199,255,46,0.1)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/social-proof.png"
                alt="22.6K views"
                style={{ width: "85%", height: "auto", objectFit: "contain" }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color: "#C7FF2E",
                }}
              >
                ● social
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  bottom: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                }}
              >
                live post · 22.6K
              </div>
            </div>
          </div>

          {/* Column 3 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                flex: 1,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#0E0E0E",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/arnaldo-energetico.png"
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "50% 60%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85))",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  bottom: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                }}
              >
                clip 03
              </div>
            </div>
            <div
              style={{
                flex: 1,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#0E0E0E",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/arnaldo-energetico.png"
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "20% 30%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85))",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  bottom: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                }}
              >
                clip 04
              </div>
            </div>
          </div>

          {/* Column 4 — next slot */}
          <div
            style={{
              position: "relative",
              aspectRatio: "9/16",
              border: "1px dashed rgba(255,255,255,0.14)",
              background: "#080808",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 50% 40%, rgba(199,255,46,0.04), transparent 70%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                opacity: 0.5,
              }}
            >
              ● next
            </div>
            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                right: 12,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                opacity: 0.5,
              }}
            >
              mais vem por aí
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ opacity: 0.55 }}>
            // identity · content · consistency
          </span>
          <span style={{ opacity: 0.4 }}>métricas atualizadas em 2025.10</span>
        </div>
      </section>

      {/* ================= INFLUENCER ENGINEER ================= */}
      <section
        id="engineer"
        style={{
          position: "relative",
          padding: "160px 32px",
          background: "#080808",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 1000,
            height: 1000,
            background:
              "radial-gradient(circle, rgba(199,255,46,0.08), transparent 60%)",
            pointerEvents: "none",
            animation: "landing-glowpulse 6s ease-in-out infinite",
          }}
        />

        <div style={{ maxWidth: 1600, margin: "0 auto", position: "relative" }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 36,
            }}
          >
            [ 11 ] &nbsp;·&nbsp; a new profession
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 56,
              alignItems: "end",
              marginBottom: 100,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(48px, 8vw, 128px)",
                lineHeight: 0.88,
                letterSpacing: "-0.05em",
                textTransform: "uppercase",
              }}
            >
              Conheça o<br />
              <span style={{ color: "#C7FF2E" }}>
                Influencer
                <br />
                Engineer.
              </span>
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 20,
                lineHeight: 1.4,
                color: "rgba(245,245,242,0.78)",
                maxWidth: 460,
                paddingBottom: 20,
              }}
            >
              Uma nova profissão para uma internet onde você não precisa ser o
              creator para construir uma audiência.
            </p>
          </div>

          {/* Central node diagram */}
          <div
            style={{
              position: "relative",
              minHeight: 520,
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
              viewBox="0 0 1200 520"
              preserveAspectRatio="none"
            >
              <line
                x1="600"
                y1="260"
                x2="140"
                y2="80"
                stroke="rgba(199,255,46,0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1="600"
                y1="260"
                x2="390"
                y2="60"
                stroke="rgba(199,255,46,0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1="600"
                y1="260"
                x2="810"
                y2="60"
                stroke="rgba(199,255,46,0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1="600"
                y1="260"
                x2="1060"
                y2="80"
                stroke="rgba(199,255,46,0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1="600"
                y1="260"
                x2="140"
                y2="440"
                stroke="rgba(199,255,46,0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1="600"
                y1="260"
                x2="390"
                y2="460"
                stroke="rgba(199,255,46,0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1="600"
                y1="260"
                x2="810"
                y2="460"
                stroke="rgba(199,255,46,0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <line
                x1="600"
                y1="260"
                x2="1060"
                y2="440"
                stroke="rgba(199,255,46,0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            </svg>

            {/* Central engineer node */}
            <div
              style={{
                position: "relative",
                zIndex: 2,
                width: 260,
                height: 260,
                borderRadius: "50%",
                border: "1px solid #C7FF2E",
                display: "grid",
                placeItems: "center",
                background:
                  "radial-gradient(circle, rgba(199,255,46,0.15), rgba(5,5,5,0.95) 70%)",
                boxShadow: "0 0 80px rgba(199,255,46,0.15)",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.6,
                    marginBottom: 8,
                  }}
                >
                  operator
                </div>
                <div
                  style={{
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 800,
                    fontSize: 32,
                    lineHeight: 0.95,
                    letterSpacing: "-0.03em",
                    textTransform: "uppercase",
                    color: "#C7FF2E",
                  }}
                >
                  Engineer
                </div>
                <div
                  style={{
                    marginTop: 10,
                    width: 40,
                    height: 1,
                    background: "#C7FF2E",
                    marginLeft: "auto",
                    marginRight: "auto",
                  }}
                />
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    opacity: 0.7,
                  }}
                >
                  1 pessoa
                </div>
              </div>
            </div>

            {/* Creator nodes */}
            <div
              style={{
                position: "absolute",
                top: 20,
                left: "2%",
                width: 170,
                padding: 14,
                border: "1px solid rgba(199,255,46,0.3)",
                background: "#060606",
                zIndex: 3,
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  border: "1px solid rgba(199,255,46,0.4)",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/arnaldo-energetico.png"
                  alt="Arnaldo Nitro"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#C7FF2E",
                  }}
                >
                  ● #001
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                  }}
                >
                  ARNALDO
                </div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    opacity: 0.5,
                  }}
                >
                  humor · noite
                </div>
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "24%",
                width: 170,
                padding: 14,
                border: "1px solid rgba(240,55,154,0.4)",
                background: "#060606",
                zIndex: 3,
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  border: "1px solid rgba(240,55,154,0.4)",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/ze-zen-pfp.png"
                  alt="Zé Zen"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#F0379A",
                  }}
                >
                  ● #002
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                  }}
                >
                  ZÉ ZEN
                </div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    opacity: 0.5,
                  }}
                >
                  comportamento
                </div>
              </div>
            </div>

            {[
              { top: 0, right: "24%", n: "003" },
              { top: 0, right: "2%", n: "004", topAdjust: 20 },
            ].map((slot) => (
              <div
                key={slot.n}
                style={{
                  position: "absolute",
                  top: slot.topAdjust ?? slot.top,
                  right: slot.right,
                  width: 160,
                  padding: "14px 16px",
                  border: "1px dashed rgba(255,255,255,0.2)",
                  background: "#060606",
                  zIndex: 3,
                }}
              >
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.4,
                  }}
                >
                  ● #{slot.n} · slot
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                  }}
                >
                  UNDEFINED
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    opacity: 0.3,
                  }}
                >
                  [ next slot ]
                </div>
              </div>
            ))}
            {[
              { bottom: 20, left: "2%", n: "005" },
              { bottom: 0, left: "24%", n: "006" },
              { bottom: 0, right: "24%", n: "007" },
              { bottom: 20, right: "2%", n: "008" },
            ].map((slot) => (
              <div
                key={slot.n}
                style={{
                  position: "absolute",
                  bottom: slot.bottom,
                  left: slot.left,
                  right: slot.right,
                  width: 160,
                  padding: "14px 16px",
                  border: "1px dashed rgba(255,255,255,0.2)",
                  background: "#060606",
                  zIndex: 3,
                }}
              >
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    opacity: 0.4,
                  }}
                >
                  ● #{slot.n} · slot
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                  }}
                >
                  UNDEFINED
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    opacity: 0.3,
                  }}
                >
                  [ next slot ]
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 100,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {[
              { value: "1", label: "pessoa", accent: true },
              { value: "10", label: "identidades" },
              { value: "10", label: "audiências" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{ background: "#050505", padding: "40px 32px" }}
              >
                <div
                  style={{
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 800,
                    fontSize: 72,
                    lineHeight: 1,
                    color: stat.accent ? "#C7FF2E" : undefined,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    opacity: 0.6,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FUTURE ================= */}
      <section
        style={{
          position: "relative",
          padding: "160px 32px",
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.5,
            marginBottom: 36,
          }}
        >
          [ 12 ] &nbsp;·&nbsp; today → tomorrow
        </div>
        <h2
          style={{
            margin: "0 0 80px",
            fontFamily: "'Inter Tight', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(48px, 7.4vw, 120px)",
            lineHeight: 0.88,
            letterSpacing: "-0.045em",
            textTransform: "uppercase",
            maxWidth: 1300,
          }}
        >
          Hoje, você cria
          <br />
          um creator.
          <br />
          <span
            style={{ color: "#C7FF2E", fontStyle: "italic", fontWeight: 500 }}
          >
            Amanhã,
          </span>{" "}
          você
          <br />
          opera uma rede.
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Today */}
          <div style={{ background: "#060606", padding: "48px 40px" }}>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#C7FF2E",
                marginBottom: 32,
              }}
            >
              ● Hoje · shipping
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              {["Identity", "Visual", "Character sheets", "Video prompts"].map(
                (item, i, arr) => (
                  <div
                    key={item}
                    style={{
                      padding: "20px 0",
                      borderBottom:
                        i < arr.length - 1 || true
                          ? "1px solid rgba(255,255,255,0.08)"
                          : undefined,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Inter Tight', sans-serif",
                        fontWeight: 600,
                        fontSize: 22,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {item}
                    </span>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: "#C7FF2E",
                        letterSpacing: "0.14em",
                      }}
                    >
                      ✓ live
                    </span>
                  </div>
                ),
              )}
              <div
                style={{
                  padding: "20px 0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 600,
                    fontSize: 22,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Shadow
                </span>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    color: "#C7FF2E",
                    letterSpacing: "0.14em",
                  }}
                >
                  ✓ beta
                </span>
              </div>
            </div>
          </div>
          {/* Tomorrow */}
          <div style={{ background: "#080808", padding: "48px 40px" }}>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                opacity: 0.5,
                marginBottom: 32,
              }}
            >
              ◌ Em breve · roadmap
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              {[
                { label: "Mais modelos", tag: "— soon" },
                { label: "Mais criação", tag: "— soon" },
                { label: "Mais automação", tag: "— soon" },
                { label: "Ferramentas de operação", tag: "— soon" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: "20px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Inter Tight', sans-serif",
                      fontWeight: 600,
                      fontSize: 22,
                      letterSpacing: "-0.01em",
                      opacity: 0.8,
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      opacity: 0.4,
                      letterSpacing: "0.14em",
                    }}
                  >
                    {item.tag}
                  </span>
                </div>
              ))}
              <div
                style={{
                  padding: "20px 0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Inter Tight', sans-serif",
                    fontWeight: 600,
                    fontSize: 22,
                    letterSpacing: "-0.01em",
                    opacity: 0.8,
                  }}
                >
                  Creator OS completo
                </span>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    opacity: 0.4,
                    letterSpacing: "0.14em",
                  }}
                >
                  — v1.0
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= COMEÇAR ================= */}
      <GetStartedSection />

      {/* ================= FOOTER ================= */}
      <footer
        id="nido"
        style={{
          position: "relative",
          padding: "80px 32px 48px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "#050505",
        }}
      >
        <div style={{ maxWidth: 1600, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
              gap: 40,
              alignItems: "start",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: "1.5px solid #C7FF2E",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <div
                    style={{ width: 12, height: 12, background: "#C7FF2E" }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12,
                    letterSpacing: "0.14em",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>CREATOR AI</div>
                  <div style={{ opacity: 0.5, fontSize: 10 }}>by NIDO</div>
                </div>
              </div>
              <div
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontSize: 20,
                  lineHeight: 1.3,
                  letterSpacing: "-0.015em",
                  maxWidth: 400,
                  color: "rgba(245,245,242,0.75)",
                }}
              >
                As ferramentas para uma internet onde qualquer pessoa pode
                construir creators.
              </div>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  opacity: 0.4,
                  marginBottom: 20,
                }}
              >
                Produto
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                }}
              >
                <a href="#produto" style={{ opacity: 0.75 }}>
                  Como funciona
                </a>
                <a href="#creators" style={{ opacity: 0.75 }}>
                  Creators
                </a>
                <a href="#engineer" style={{ opacity: 0.75 }}>
                  Influencer Engineer
                </a>
                <a href="/auth/login" style={{ opacity: 0.75 }}>
                  Entrar
                </a>
              </div>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  opacity: 0.4,
                  marginBottom: 20,
                }}
              >
                NIDO
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                }}
              >
                <a href="#" style={{ opacity: 0.75 }}>
                  Studio
                </a>
                <a href="#" style={{ opacity: 0.75 }}>
                  Manifesto
                </a>
                <a href="#" style={{ opacity: 0.75 }}>
                  Press
                </a>
              </div>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  opacity: 0.4,
                  marginBottom: 20,
                }}
              >
                Siga
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                }}
              >
                <a href="#" style={{ opacity: 0.75 }}>
                  Instagram
                </a>
                <a href="#" style={{ opacity: 0.75 }}>
                  TikTok
                </a>
                <a href="#" style={{ opacity: 0.75 }}>
                  X / Twitter
                </a>
                <a href="#" style={{ opacity: 0.75 }}>
                  LinkedIn
                </a>
              </div>
            </div>
          </div>

          {/* Giant wordmark */}
          <div
            style={{
              marginTop: 100,
              paddingTop: 32,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily: "'Inter Tight', sans-serif",
                fontWeight: 900,
                fontSize: "clamp(80px, 20vw, 320px)",
                lineHeight: 0.85,
                letterSpacing: "-0.065em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                color: "rgba(255,255,255,0.04)",
              }}
            >
              CREATOR&nbsp;AI
              <span style={{ color: "rgba(199,255,46,0.3)" }}>.</span>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.14em",
              opacity: 0.4,
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <span>© 2026 NIDO · Creator OS v0.1 · Private alpha</span>
            <span>
              <a href="/privacidade">Privacidade</a> ·{" "}
              <a href="/termos">Termos</a>
            </span>
            <span>Built in Brazil · for the internet.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function GetStartedSection() {
  const { user, disabled, signInWithGoogle } = useAuth();
  const recursos = useRecursos();
  const [loading, setLoading] = useState(false);

  const showRealLogin = recursos.login && !disabled;
  const isLoggedIn = showRealLogin && !!user;

  async function onGoogle() {
    setLoading(true);
    try {
      await signInWithGoogle();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="comecar"
      style={{
        position: "relative",
        padding: "160px 32px 100px",
        background: "linear-gradient(180deg, #050505 0%, #0a0a0a 100%)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          transform: "translate(-50%, -50%)",
          width: 1200,
          height: 1200,
          background:
            "radial-gradient(circle, rgba(199,255,46,0.1), transparent 50%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 1600, margin: "0 auto", position: "relative" }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.5,
            marginBottom: 36,
          }}
        >
          [ 13 ] &nbsp;·&nbsp; comece agora
        </div>

        <h2
          style={{
            margin: "0 0 64px",
            fontFamily: "'Inter Tight', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(64px, 11vw, 200px)",
            lineHeight: 0.88,
            letterSpacing: "-0.055em",
            textTransform: "uppercase",
            maxWidth: 1500,
          }}
        >
          Crie <span style={{ color: "#C7FF2E" }}>alguém</span>
          <br />
          que a internet
          <br />
          <span style={{ fontStyle: "italic", fontWeight: 500 }}>
            queira seguir.
          </span>
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "start",
            marginTop: 72,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 22,
                lineHeight: 1.4,
                color: "rgba(245,245,242,0.78)",
                maxWidth: 460,
              }}
            >
              Entre na primeira geração de{" "}
              <span style={{ color: "#C7FF2E" }}>Influencer Engineers</span> —
              operadores de creators sintéticos.
            </p>
            <div
              style={{
                marginTop: 40,
                display: "grid",
                gap: 14,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13,
                letterSpacing: "0.1em",
              }}
            >
              {[
                "Primeiro creator grátis",
                "Acesso ao private alpha",
                "Seus personagens salvos na sua conta",
                "Acesse de qualquer dispositivo",
              ].map((item) => (
                <div
                  key={item}
                  style={{ display: "flex", gap: 12, alignItems: "center" }}
                >
                  <span style={{ color: "#C7FF2E" }}>▸</span> {item}
                </div>
              ))}
            </div>
          </div>

          {/* Card */}
          <div
            style={{
              border: "1px solid rgba(199,255,46,0.3)",
              background: "rgba(5,5,5,0.6)",
              backdropFilter: "blur(10px)",
              padding: 40,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                width: 20,
                height: 20,
                borderTop: "1px solid #C7FF2E",
                borderLeft: "1px solid #C7FF2E",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 20,
                height: 20,
                borderTop: "1px solid #C7FF2E",
                borderRight: "1px solid #C7FF2E",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                width: 20,
                height: 20,
                borderBottom: "1px solid #C7FF2E",
                borderLeft: "1px solid #C7FF2E",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 10,
                right: 10,
                width: 20,
                height: 20,
                borderBottom: "1px solid #C7FF2E",
                borderRight: "1px solid #C7FF2E",
              }}
            />

            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#C7FF2E",
                marginBottom: 32,
              }}
            >
              ● creator os · private alpha
            </div>

            {isLoggedIn ? (
              <div style={{ display: "grid", gap: 20 }}>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "rgba(245,245,242,0.8)",
                  }}
                >
                  Você já está logado. Bora criar seu creator.
                </p>
                <a
                  href="/app"
                  style={{
                    padding: "22px 28px",
                    background: "#C7FF2E",
                    color: "#050505",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 13,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    boxShadow: "0 0 48px rgba(199,255,46,0.25)",
                  }}
                >
                  <span>Ir para o app</span>
                  <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
                    <path
                      d="M1 6H17M17 6L12 1M17 6L12 11"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                </a>
              </div>
            ) : !showRealLogin ? (
              <div style={{ display: "grid", gap: 20 }}>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "rgba(245,245,242,0.8)",
                  }}
                >
                  Comece agora, direto no navegador.
                </p>
                <a
                  href="/app"
                  style={{
                    padding: "22px 28px",
                    background: "#C7FF2E",
                    color: "#050505",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 13,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    boxShadow: "0 0 48px rgba(199,255,46,0.25)",
                  }}
                >
                  <span>Começar agora</span>
                  <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
                    <path
                      d="M1 6H17M17 6L12 1M17 6L12 11"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                </a>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 24 }}>
                <button
                  type="button"
                  onClick={onGoogle}
                  disabled={!!loading}
                  style={{
                    padding: "18px 24px",
                    background: "#F5F5F2",
                    color: "#050505",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 13,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    width: "100%",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  <GoogleIcon />
                  {loading ? "Abrindo…" : "Entrar com Google"}
                </button>

                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    opacity: 0.5,
                    textAlign: "center",
                  }}
                >
                  Seu primeiro creator será{" "}
                  <span style={{ color: "#C7FF2E", opacity: 1 }}>grátis</span>.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
