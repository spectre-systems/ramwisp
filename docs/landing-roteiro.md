# Roteiro da home — cada bloco responde a uma pergunta

Regra: se um bloco não responde a uma pergunta que o visitante tem **naquele momento da rolagem**, ele sai.
Personagem: cada subagente é um **fantasminha (spectre)**. O humor dele mostra o estado: apertado e triste
quando falta RAM, feliz quando ganha espaço, trabalhando, e evaporando quando termina.

| # | Pergunta do visitante | Resposta (texto) | Prova (visual) | Por que está aqui |
|---|---|---|---|---|
| 1 | "O que é isso? É comigo?" | **Problema:** subagentes em paralelo não cabem na RAM do seu computador. **Solução:** o wisp dá a cada um uma máquina própria na nuvem e apaga tudo quando termina. | Cena animada em 3 atos, com legenda: (1) fantasminhas se espremendo numa RAM de 16 GB, medidor no vermelho, um deles **na fila**; (2) eles sobem e cada um ganha a própria caixa de RAM; (3) a resposta volta e a caixa evapora. | Quem não rolar a página precisa sair sabendo o problema e a solução. |
| 2 | "Como eu usaria isso no dia a dia?" | Você continua no Claude Code ou no Codex e pede em português. O agente manda o trabalho pesado para o wisp sozinho. | Um terminal real: o pedido, a chamada `spawn_agent`, 4 fantasminhas subindo, as respostas voltando. | Mostra que não é mais uma ferramenta para aprender. |
| 3 | "E a minha chave ou o meu login? Vocês veem?" | A chave sai do seu computador **trancada** para uma máquina lacrada que só abre para ela. Nem nós, nem a AWS, nem quem invadir o servidor conseguem ler. | Chave indo num envelope lacrado; olhos de fora (o "servidor wisp", um "curioso", a "AWS") tentam espiar e só veem ▒▒▒. | É a objeção número 1 para quem vai entregar credencial. |
| 4 | "E depois? Fica alguma coisa?" | Terminou, **evaporou**: a chave é apagada, a memória destruída, a máquina desligada. | O fantasminha entrega a resposta e dissolve, com o checklist aparecendo ✓ ✓ ✓. | Responde ao medo de deixar rastro ou credencial pendurada. |
| 5 | "Quem controla? Quanto vou gastar?" | Você: vê cada fantasminha ao vivo, encerra quando quiser, paga por segundo, e cada tarefa tem limite de tempo. Começa com crédito grátis. | Recorte do painel real: fantasminhas ao vivo com barra de RAM e botão "encerrar", mais o preço por hora de cada tamanho. | Tira o medo de custo descontrolado. |
| 6 | "Como começo?" | Um comando, e o login pelo navegador. | Comando copiável + os 3 passos. | É a ação. |
| 7 | Objeções que sobraram | FAQ curto. | — | Última barreira antes do cadastro. |

Sai da página atual: o diagrama abstrato "Pedir. Provar. Selar. Evaporar." (vira os blocos 3 e 4, contados com o
personagem) e a grade de preços solta (vira parte do bloco 5, junto do controle).

Marca: "wisp" ganha fonte própria de logotipo (Unbounded), com um fantasminha no pingo do i.
