FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Dust II çarpışma ağı depoda tutulmuyor; Awpy paketinden indirilip SHA-256 ile doğrulanır.
# İndirilemezse CS beta çarpışma ağı olmadan (yalnız nav ile) çalışır.
COPY scripts/fetch-dust2-collision.js scripts/
COPY server/simulation/data/de_dust2-collision.json server/simulation/data/
RUN node scripts/fetch-dust2-collision.js || echo "[dust2] Uyarı: çarpışma ağı indirilemedi."

COPY . .

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server/index.js"]
