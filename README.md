# Minha Nuvem

Cloud storage pessoal do Leo — app próprio (não é fork do Nextcloud),
inspirado no conjunto de recursos do Nextcloud, mas com código 100% nosso.
Reaproveita a infraestrutura que já existia: Supabase (login + banco) e
Cloudflare R2 (armazenamento dos arquivos).

Roda em paralelo ao Nextcloud atual (`nuvem.sinmpla.com.br`) na mesma VPS,
sem mexer nele.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind)
- **Supabase** — Auth + Postgres (schema próprio `cloudapp`, isolado das
  tabelas `oc_*` do Nextcloud, com Row Level Security em tudo)
- **Cloudflare R2** — arquivos armazenados via URLs pré-assinadas,
  upload/download direto navegador <-> R2 (sem passar pelo servidor da
  aplicação)

## O que tem

- Login e cadastro
- Pastas, upload (drag-and-drop, com progresso real), download, renomear,
  excluir
- Galeria de fotos e vídeos do celular (`/dashboard/media`)
- Links de compartilhamento públicos
- Cota de armazenamento por usuário
- PWA — instalável no Android/Chrome com um toque, com instruções passo a
  passo pro iOS (que não tem instalação nativa de app web)
- Painel admin (`/admin`) — usuários, planos, saúde do sistema (Supabase,
  R2, servidor)

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preencher com os valores reais
npm run dev
```

## Deploy

Veja [`deploy/README.md`](./deploy/README.md).

## Banco de dados

O schema fica em [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)
e já foi aplicado ao projeto Supabase real (`minha-nuvem`).
