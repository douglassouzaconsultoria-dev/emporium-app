# 📲 Publicar o Empório Brumado na Google Play

O app da Play é o mesmo site (emporiobrumado.com) dentro de um app Android (TWA, Trusted Web Activity).
Toda melhoria no site já aparece no app, sem enviar versão nova para a Play.

Na Play, a categoria marcada com **📱 Esconder no app da Play Store** (Admin → 📁 Categorias) não aparece.
É o caso da **Tabacaria**, porque a política da Google Play não permite apps que facilitam a venda de tabaco.
No site e no app instalado pelo navegador, a Tabacaria continua aparecendo.

---

## 1. Conta de desenvolvedor (empresa)

1. Peça o número **D-U-N-S** da empresa. É grátis, mas pode levar alguns dias.
   O próprio Play Console mostra o link quando você escolhe "Organização".
   - EMPÓRIO BRUMADO LTDA · CNPJ 03.697.793/0001-38
   - Rua das Imbuias, 776, Morada Nova, Patrocínio – MG, CEP 38748-650
2. Crie a conta em https://play.google.com/console:
   - tipo **Organização**;
   - taxa única de **US$ 25**;
   - verificação da empresa e de um telefone e e-mail de contato.
3. Por ser conta de organização, não é preciso o teste fechado com 12 pessoas por 14 dias, que é exigido de contas pessoais novas.

## 2. Gerar o app Android (PWABuilder, pelo navegador)

1. Abra https://www.pwabuilder.com, digite `https://emporiobrumado.com` e toque em **Start**.
2. Toque em **Package for stores → Android → Generate Package** e preencha as opções:

   | Campo | Valor |
   |---|---|
   | Package ID | `com.emporiobrumado.app` (**não dá para mudar depois**) |
   | App name | Empório Brumado |
   | Launcher name | Empório |
   | Start URL | `/?app=play` (é como o site sabe que está no app da Play e esconde a Tabacaria) |
   | Theme / Nav color | `#C41E3A` |
   | Signing key | **Create new** |

3. Baixe o `.zip`. Dentro dele estão:
   - o arquivo **`.aab`**, que é o que vai para a Play;
   - o **`signing.keystore`** e as **senhas** (`signing-key-info.txt`);
   - o **`assetlinks.json`**.
4. ⚠️ **Guarde o keystore e as senhas** num lugar seguro, como o Google Drive e um pen drive.
   Eles são necessários para mandar atualizações do app Android no futuro.
   As atualizações do site não precisam deles.

## 3. Ligar o app ao site (para não aparecer a barra de endereço)

1. Mande para o Claude o **`assetlinks.json`** que veio no zip.
2. Depois de criar o app no Play Console, abra **Testar e lançar → Configuração → Integridade do app → Assinatura de apps**
   e copie também a **impressão digital SHA-256 da chave de assinatura do app**.
3. Os dois vão para o arquivo `frontend/public/.well-known/assetlinks.json` do site.
   Sem isso, o app abre mostrando uma barrinha com o endereço do site no topo.

## 4. Ficha da loja (Play Console)

- **Nome do app:** Empório Brumado
- **Descrição breve** (máx. 80 caracteres):
  > Supermercado em Patrocínio-MG: peça pelo celular e receba suas compras em casa.
- **Descrição completa:**
  > O Empório Brumado agora está no seu celular! Faça as compras do supermercado sem sair de casa e receba tudo na sua porta, aqui em Patrocínio-MG.
  >
  > • Produtos do dia a dia: mercearia, bebidas, frios, hortifrúti, limpeza e muito mais
  > • Ofertas da semana e os mais vendidos em destaque
  > • Produtos por peso: escolha a quantidade em gramas
  > • ❤️ Favoritos: ache rápido o que você sempre compra
  > • 🔁 Pedir de novo: repita uma compra antiga com um toque
  > • Pague com PIX, cartão ou dinheiro na entrega
  > • 🔔 Aviso no celular quando o pedido sair para entrega e quando for entregue
  > • Acompanhe seus pedidos e avalie a entrega
  >
  > Entregamos em Patrocínio-MG. A taxa de entrega aparece antes de você confirmar o pedido.
  > Venda de bebidas alcoólicas proibida para menores de 18 anos.
- **Ícone 512×512:** `docs/google-play/icone-512.png`
- **Gráfico de destaque 1024×500:** `docs/google-play/feature-graphic-1024x500.png`
- **Capturas de tela do celular** (mínimo 2, recomendado 4 a 8): tire no seu celular, com o app aberto,
  mostrando a loja, um produto, o carrinho e "Meus Pedidos". Use telas sem cigarro.
- **Categoria:** Compras · **E-mail de contato:** emporiobrumado@gmail.com · **Site:** https://emporiobrumado.com

## 5. Conteúdo do app (Play Console → Política → Conteúdo do app)

| Item | O que responder |
|---|---|
| Política de privacidade | https://emporiobrumado.com/privacidade.html |
| Acesso ao app | "Todas ou algumas funcionalidades são restritas" → criar uma **conta de teste de cliente** (usuário e senha) só para a revisão do Google |
| Anúncios | Não contém anúncios |
| Classificação de conteúdo | Responder o questionário (categoria Compras). Marcar que o app **permite a compra de bebidas alcoólicas** |
| Público-alvo | **18 anos ou mais** |
| Segurança dos dados | Ver abaixo |
| Exclusão de conta | Sim, dentro do app. Link: https://emporiobrumado.com/excluir-conta.html |
| App de governo / financeiro / saúde | Não |

### Segurança dos dados (o que marcar)
- **Dados coletados:**
  - Nome, e-mail (opcional), telefone, endereço;
  - Histórico de compras (pedidos);
  - Fotos (só a foto de perfil, opcional);
  - ID do dispositivo/notificações (só se ativar os avisos).
- **Finalidade:** funcionalidade do app e gerenciamento da conta. Nada para publicidade e nada vendido a terceiros.
- **Dados criptografados em trânsito:** Sim (HTTPS).
- **O usuário pode pedir a exclusão:** Sim.

## 6. Enviar

1. Abra **Produção → Criar nova versão** e envie o `.aab`.
2. Mande para revisão. A primeira revisão costuma levar alguns dias.
3. Depois de aprovado, o link fica `https://play.google.com/store/apps/details?id=com.emporiobrumado.app`.
