# Voz local do Agente TSK

1. Abra `server/.env.local` e substitua apenas `COLE_SUA_CHAVE_AQUI` pela chave Gemini. Não compartilhe o arquivo nem publique a chave. Não use o prefixo EXPO_PUBLIC para essa chave.
2. Na raiz do projeto, rode `npm.cmd run voice` em um terminal.
3. Em outro terminal, reinicie o Expo com `npx.cmd expo start --clear` para carregar a configuração local.
4. Use iPhone e computador na mesma rede privada. Se o Windows pedir permissão de rede para Node, permita apenas em rede privada. A porta local do backend é 3001.
5. No iPhone, toque em Registrar por voz, permita o microfone, fale uma despesa de hoje e toque em Parar e interpretar. A gravação termina após 20 segundos. A despesa válida é adicionada automaticamente, com confirmação e opção de desfazer. Sem indicação de Pessoal/Familiar na fala, é usada a seleção atual do formulário.

O modelo configurado é gemini-3.5-flash-lite, com faixa gratuita conforme a documentação consultada. A cota real depende do projeto. Este código não habilita faturamento nem troca automaticamente para outro modelo. Cota esgotada gera mensagem de erro.

Áudios são enviados ao Google; na faixa gratuita, o conteúdo pode ser usado para melhoria de produtos. Use dados fictícios. O backend não salva áudio nem registra chaves, e o app tenta apagar o arquivo temporário após o envio. Os gastos são salvos localmente no aparelho com AsyncStorage.

O backend aceita no máximo 30 solicitações por execução, uma por vez. O token local é uma barreira para testes em Wi-Fi privado, não autenticação de produção. Não exponha a porta 3001 na internet. Produção exige HTTPS, autenticação por usuário e controle de consumo persistente.

Verificação local: `node --test server/voice.test.mjs`. O teste usa um Gemini simulado, sem consumir cota. O teste real de áudio precisa do iPhone e da chave configurada pelo usuário.
