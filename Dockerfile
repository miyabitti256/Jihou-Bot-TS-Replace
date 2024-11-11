FROM oven/bun:1.1.34
WORKDIR /app
COPY package.json bun.lockb ./
COPY prisma ./prisma
RUN bun install
COPY . .
RUN bunx prisma generate
CMD ["bun", "run", "start"]