# Voz com o app aberto e integração Siri

## Estado da implementação

O registro pelo botão continua compatível com Expo Go. O modo Agente e a Siri precisam de uma build iOS própria; o Expo Go não inclui os módulos nativos deste projeto. As verificações JavaScript/TypeScript não substituem a compilação Swift e o teste real no iPhone.

## Modo Agente

Na build própria, ative **Ativar escuta por Agente**. Diga **Agente, gastei dez reais em gasolina** e faça uma pausa para o reconhecedor concluir a frase. Também é possível dizer **Agente**, pausar e falar o gasto em até oito segundos.

O reconhecimento usa `requiresOnDeviceRecognition: true` em português brasileiro. Se o reconhecedor/modelo local não estiver disponível, o app mostra uma mensagem e mantém o botão antigo. Não há envio contínuo de áudio: apenas o texto do comando identificado é enviado ao backend/Gemini. A escuta termina ao sair do app, não fica ativa com a tela bloqueada, e precisa ser ativada de novo ao voltar. Uso prolongado mantém o microfone ativo e consome bateria.

## Siri

A ação nativa **Lançar gasto** recebe um parâmetro de texto **Gasto**. Use **E aí, Siri, lance no Agente Financeiro**. A Siri pode solicitar **Qual foi o gasto?**; responda **dez reais em gasolina**. O apelido Agente está declarado, mas o reconhecimento de **lance no agente dez reais de gasolina** em uma única frase depende da Siri/iOS e só pode ser validado no aparelho. Não há promessa de correspondência exata.

O intent abre o app e coloca o comando numa fila nativa local. O app interpreta o texto e salva o gasto antes de confirmar/retirar o comando da fila. Falhas mantêm o pendente para tentar novamente ou descartar. IDs persistentes impedem que receber o mesmo comando novamente duplique o gasto, inclusive após desfazer/excluir. A Siri informa envio para o app, e não sucesso financeiro antecipado.

## Dados

As despesas agora são salvas localmente com AsyncStorage. Não há sincronização familiar nem criptografia adicional ao armazenamento local da plataforma. A fila Siri guarda o texto do comando no UserDefaults até concluir ou descartar. Desinstalar o app remove esses dados. Dados do Expo Go não migram automaticamente para a build própria.

## Build a partir do Windows

1. Para instalar uma build ad hoc no iPhone com Expo Build, é necessária assinatura Apple Developer ativa e registro do aparelho. Não é preciso comprar um Mac.
2. O projeto usa o identificador proposto `com.teskegui.agentetsk`; confirme sua disponibilidade durante a configuração Apple.
3. Na raiz: `npx.cmd eas-cli@latest login`, depois `npx.cmd eas-cli@latest build:configure` e `npx.cmd eas-cli@latest device:create`.
4. Gere a build: `npx.cmd eas-cli@latest build --platform ios --profile development`.
5. Instale o resultado no iPhone registrado. Inicie `npm.cmd run voice` e, em outro terminal, `npx.cmd expo start --dev-client --lan`.
6. Abra a build própria e conecte-a ao servidor de desenvolvimento na mesma rede Wi-Fi. A configuração atual usa o backend local na porta 3001; o computador precisa continuar ligado. Para uso externo/produção ainda será necessário um backend HTTPS com autenticação.

`.easignore` exclui todo o diretório server e arquivos de ambiente do upload. A chave Gemini continua somente em `server/.env.local`. O token público de desenvolvimento é fornecido pelo Metro local; não é uma credencial de produção. Uma build preview independente não terá backend configurado e não é o fluxo de teste desta etapa.

## Verificações e testes pendentes

Rode `node --experimental-test-module-mocks --test --test-isolation=none tests/commands.test.mjs server/voice.test.mjs`, `npx.cmd tsc --noEmit` e `npx.cmd eslint src/app/index.tsx src/components/voice-expense.tsx src/components/hands-free-expense.tsx src/components/siri-expense.tsx src/services server plugins tests`.

No iPhone: validar permissões recusadas, disponibilidade de português local, pausa após a frase, ignorar fala sem Agente, parar ao bloquear/sair, dois gastos iguais intencionais, desfazer, persistência após fechar, Siri com app fechado/aberto, duplicação de fila e falha de rede/cota. O Swift e o reconhecimento Siri ainda precisam da primeira compilação e desses testes físicos.
