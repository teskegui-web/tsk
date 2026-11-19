# Cadastro, senha e Google — ativação

A hospedagem Sites atual continua com seu login ChatGPT. Esta integração é destinada à próxima hospedagem web, fora do gate do Sites, e só é ativada com `EXPO_PUBLIC_AUTH_PROVIDER=supabase`. Não altere a visibilidade do site atual como forma de contornar o login.

## Projeto Supabase

1. Crie o projeto `agente-financeiro` no dashboard Supabase. Não compartilhe a senha do banco nem uma chave `service_role`/secret.
2. Aplique a migração em `migrations/202611170001_finance_auth.sql` pelo SQL Editor ou CLI. Ela cria armazenamento com RLS por `auth.uid()`, gravação versionada e cota de IA. Só deve ser aplicada uma vez.
3. Em Authentication, mantenha a confirmação de e-mail habilitada; configure senha mínima de 10 caracteres, proteção contra senhas vazadas quando disponível e SMTP próprio antes do lançamento público. O envio de teste do serviço tem limites.
4. Em URL Configuration, configure a URL final da nova hospedagem e a allowlist de redirecionamentos, incluindo a raiz final e `http://localhost:8081/` para teste local. Evite curingas amplos em produção.
5. Copie a URL do projeto e a chave publicável em `.env.local`, conforme `.env.supabase.example`. A chave publicável é usada com RLS; não concede acesso aos dados sem sessão autorizada.

## Google

1. No Google Cloud Console, configure a tela de consentimento do aplicativo e crie um OAuth Client do tipo Web.
2. Use a URL de callback que o Supabase mostra no provedor Google, normalmente `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
3. Coloque Client ID e Client Secret **somente no painel do Supabase**, habilite o provedor Google e salve. O app solicita apenas identificação básica: openid, email e profile; não solicita acesso a mensagens do Gmail.
4. Se o aplicativo Google estiver em teste, adicione as contas autorizadas de teste ou conclua os requisitos de publicação do consentimento.

## IA

Configure nos Secrets da Edge Function `GEMINI_API_KEY` e `APP_ORIGIN` (origem HTTPS exata da nova hospedagem). Deploy: `supabase functions deploy financial-ai`. A função não usa service_role. Verifica o usuário em `/auth/v1/user` e usa um RPC autenticado para aplicar a cota antes de chamar Gemini.

## Dados existentes

O identificador de usuário Supabase é diferente do identificador Sites. Não há vinculação automática por e-mail. Exporte o backup pelo site atual e importe na conta Supabase vazia após autenticar. O app impede importação por cima de contas já preenchidas.

## Testes de ativação necessários

Cadastro e confirmação de e-mail; senha incorreta; recuperação e nova senha; Google e cancelamento; logout e conta diferente; acesso negado sem token; usuário A não lê/altera dados de B; concorrência entre dispositivos; importação de backup; cota de IA. Não trate a integração como ativa até concluir configuração e testes reais do projeto e da hospedagem.

## Estado da configuração (16/11/2026)

Projeto `jetvwghklalqqvsvmtef` conectado; migração `finance_auth` aplicada e função `financial-ai` publicada. `.env.local` configurado com a chave publicável (arquivo ignorado pelo Git). Verificados com transações descartadas: isolamento entre contas, recusa de gravação com versão antiga, bloqueio de acesso anônimo e limite de 100 chamadas de IA/dia. A ausência de políticas para `finance_ai_usage` é intencional: a tabela fica bloqueada ao cliente e só a função privada pode incrementar o contador.

Pendências externas: credenciais Google OAuth; URL final/allowlist no Auth; secrets `GEMINI_API_KEY` e `APP_ORIGIN` na função; hospedagem fora de Sites; teste real de cadastro, confirmação, recuperação, Google e logout. O site Sites publicado continua com a versão anterior. Não execute novamente a migração no projeto já configurado.

Prévia local: exporte com `npx expo export --platform web` e sirva `dist` em `http://127.0.0.1:8081/`. Cadastre essa raiz na allowlist do Supabase para os links de confirmação e recuperação; defina `APP_ORIGIN` com a mesma origem para testes de IA. Antes da publicação, troque pelas URLs HTTPS finais.
