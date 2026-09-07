# Ledgerly

Full-stack Next.js app for UK sole traders and the self-employed. Connect **Monzo Personal** and **Monzo Business**, auto-categorise spend into HMRC SA103 boxes, and estimate Income Tax + Class 4 NI for the UK tax year (6 April – 5 April).

## Stack

- Next.js 14 App Router + TypeScript + Tailwind CSS + Radix/Shadcn UI
- Prisma + SQLite (swap `DATABASE_URL` for PostgreSQL in production)
- NextAuth credentials session + separate Monzo OAuth (dual account)
- AES-256-GCM encryption for Monzo access/refresh tokens
- Rules engine + OpenAI `gpt-4o-mini` fallback for categorisation & receipt OCR

## Quick start

```bash
cp .env.example .env
npm install
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in on `/login`, then **Sync / seed demo** on the dashboard.

### Monzo OAuth

1. Create a client in the [Monzo developer portal](https://developers.monzo.com/).
2. Set redirect URI to `http://localhost:3000/api/monzo/callback`.
3. Put `MONZO_CLIENT_ID` and `MONZO_CLIENT_SECRET` in `.env`.
4. Connect Personal and Business from the dashboard (separate OAuth flows).
5. Register webhook URL `https://your-domain/api/webhooks/monzo` for live sync.

### OpenAI (optional)

Set `OPENAI_API_KEY` for AI categorisation of ambiguous merchants and receipt OCR.

### Encryption key

`TOKEN_ENCRYPTION_KEY` must be a 64-character hex string (32 bytes):

```bash
openssl rand -hex 32
```

## Features

| Area | Behaviour |
|------|-----------|
| Dual Monzo | Personal + Business OAuth, encrypted tokens |
| Ingestion | `/accounts`, paginated `/transactions`, pot-transfer exclusion |
| Webhooks | `POST /api/webhooks/monzo` |
| Rules | Built-in HMRC merchant rules (immutable) + custom rules |
| AI | `gpt-4o-mini` category + confidence + explanation |
| Splits | Business % on dual-use spend (phone, broadband) |
| Tax engine | SA103 boxes, mileage 45p/25p, WFH flat rates, IT + NI estimate |
| Tax Pot | Monthly transfer suggestion |
| Export | CSV, PDF summary, SA103 text, receipts zip |
| UI | Sidebar nav, dark/light mode, optimistic category updates |

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run db:setup` — push schema + seed demo data
- `npm run db:seed` — re-seed demo transactions

## Disclaimer

Tax figures are **estimates for planning only**, not formal tax advice. Confirm with HMRC guidance or an accountant before filing Self Assessment.
