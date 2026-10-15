# Processo do Motion no Railway (Root Directory: worker/motion).
# A imagem do Playwright já traz o Chrome e as bibliotecas dele; a versão tem
# que ser a mesma do playwright-core no package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production
CMD ["npm", "start"]
