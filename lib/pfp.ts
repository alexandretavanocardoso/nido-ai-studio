/**
 * "Gerar meu PFP" (Conta → Perfil): a foto da pessoa redesenhada no mesmo
 * estilo da arte do NFT (lib/nft/arte.ts), pelo GPT Image. A foto vem de um
 * envio ou da foto de perfil da conta. Compartilhado entre a tela e o servidor.
 */

/** Créditos de um PFP (uma imagem, o mesmo que cada opção de arte do NFT). */
export const CREDITOS_PFP = 6;

/**
 * Quantos PFPs cada conta pode gerar. Conta os que estão guardados; como só o
 * admin exclui, para os outros usuários é o total da vida da conta.
 */
export const LIMITE_PFPS = 3;

/**
 * O que o PFP tem a mais que a arte do NFT: um colar com a logo da NIDO. Vai
 * depois do prompt da arte (PROMPT_ARTE_NFT); a logo segue como a segunda
 * imagem (public/logo/NIDO AI STUDIO SEM FUNDO.png). Abre uma exceção à regra
 * "sem texto nem logo" do prompt da arte, só para o pingente.
 */
export const PROMPT_COLAR_PFP = `NIDO AI Studio necklace
The second uploaded image is the NIDO AI Studio logo. Use it only as the design of the pendant.
- Add a silver/metallic necklace around the character's neck with a pendant shaped after the NIDO AI Studio logo
- The pendant must look like a real piece of jewelry in polished silver, with a shiny metallic finish, legible and well drawn, directly inspired by the uploaded logo
- The necklace must match the character's cyberpunk visual identity and sit naturally on the chest
- Everything else follows the instructions above, without important changes
- Exception to the "No text" rule: the logo on the pendant is the only allowed lettering in the image`;
