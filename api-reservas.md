# Documentação da API — Reservas e Cancelamentos

Esta documentação descreve os endpoints **efetivamente implementados** no backend (`Express 5 + Prisma 6.19 + MongoDB`) para consumo pelo frontend.

---

## 1. Convenções Gerais

- **Base URL (desenvolvimento):** `http://localhost:3333`
- **Formato de dados:** `application/json`
- **Datas e Horários:**
  - Campos de instante (`dataHoraInicio`, `dataHoraFim`, `criadoEm`, `aceitoPeloResponsavelEm`, `analisadoEm`, `canceladoEm`) utilizam **ISO 8601 com fuso horário** (ex.: `2026-10-21T13:00:00-03:00` ou `2026-10-21T16:00:00.000Z`).
  - Datas civis (`dataFim` em recorrência e filtro `data`) utilizam o formato `AAAA-MM-DD`.
  - O fuso horário institucional considerado para cálculo de dia civil, horário de funcionamento e `diaDaSemana` é **`America/Sao_Paulo`**.
- **Identificadores (`id`, `salaId`, `responsavelId`, `solicitanteId`):**
  - Strings hexadecimais de 24 caracteres (`MongoDB ObjectId`, ex.: `"64b7f0c2a1b2c3d4e5f60718"`).
- **Autenticação:**
  - As rotas protegidas e o WebSocket leem o token JWT no cabeçalho:
    ```http
    Authorization: Bearer <token>
    ```
  - Caso o cabeçalho esteja ausente, inválido ou o usuário esteja inativo, a API retorna `401 Unauthorized` (ou rejeita o handshake WebSocket).

### Formato Padrão de Erro

```json
{
  "erro": "VALIDACAO | NAO_AUTENTICADO | PERMISSAO_NEGADA | NAO_ENCONTRADO | CONFLITO | REGRA_DE_NEGOCIO | ERRO_INTERNO",
  "mensagem": "Descrição legível do erro.",
  "detalhes": {}
}
```

### Enums Utilizados nas Respostas e Payloads

- **`StatusReserva`** (mapeamento com o diagrama UML):
  - `PENDENTE_APROVACAO` *(equivale a `EM_ANALISE` no diagrama)*
  - `APROVADA` *(equivale a `AGENDADO` no diagrama)*
  - `REJEITADA`
  - `CANCELADA` *(equivale a `CANCELADO` no diagrama)*
  - `CONCLUIDA` *(equivale a `CONCLUIDO` no diagrama)*
- **`TipoRecorrencia` (`Frequencia`):** `UNICA`, `SEMANAL`, `MENSAL`, `SEMESTRAL`, `ANUAL`
- **`DiaSemana`:** `DOMINGO`, `SEGUNDA`, `TERCA`, `QUARTA`, `QUINTA`, `SEXTA`, `SABADO`

### Notificações em tempo real

O app pode abrir uma conexão WebSocket autenticada em `/notificacoes/ws`. O servidor envia um JSON ao solicitante da reserva quando ela é aprovada, rejeitada ou cancelada. Cada mensagem contém o campo `tipo` (`APROVACAO_RESERVA`, `REJEICAO_RESERVA` ou `CANCELAMENTO_RESERVA`) e os dados da reserva e da ação.

Exemplo de conexão usando `dart:io` no Flutter:

```dart
import 'dart:convert';
import 'dart:io';

final socket = await WebSocket.connect(
  'ws://10.0.2.2:3333/notificacoes/ws',
  headers: {'Authorization': 'Bearer $token'},
);

socket.listen((mensagem) {
  final notificacao = jsonDecode(mensagem as String);
  print(notificacao['tipo']);
});
```

Use o host acessível pelo dispositivo/emulador no lugar de `10.0.2.2` e `wss://` em produção. A conexão não envia notificações antigas; o app recebe os eventos emitidos enquanto estiver conectado.

---

## 2. Fluxos de Negócio Resumidos

1. **Solicitação e Aprovação:**
   - **Professor / Coordenador:** a reserva já nasce com status `APROVADA` (`AGENDADO`), desde que não haja conflito de horário na sala.
   - **Técnico:** solicita para si mesmo (`responsavelId` omitido ou igual ao próprio ID), com no mínimo **12h de antecedência**, respeitando o limite de **2 reservas a cada 12h e 2 por dia**. Nasce `PENDENTE_APROVACAO` e aguarda aprovação do Coordenador.
   - **Aluno:** deve obrigatoriamente informar `responsavelId` (um Servidor: Professor, Técnico ou Coordenador), com no mínimo **12h de antecedência** e limite de **2 reservas a cada 12h e 2 por dia**.
     - **Etapa 1:** o Servidor responsável aceita a reserva em `PATCH /reservas/:id/aceitar-responsabilidade` (ou `PATCH /reservas/:id/aprovar`, se não for coordenador da sala), que registra `aceitoPeloResponsavelEm` e notifica o coordenador do departamento do responsável.
     - **Etapa 2:** após o aceite, o Coordenador do prédio/setor aprova em `PATCH /reservas/:id/aprovar`, mudando o status para `APROVADA` (`AGENDADO`). Se o responsável também for o coordenador da sala, deve confirmar as duas etapas separadamente: primeiro aceitar a responsabilidade e depois aprovar.
2. **Duração de Turno:**
   - Toda reserva deve ter duração exata de **50 minutos** (`dataHoraFim - dataHoraInicio === 50 min`).
3. **Recorrência (`ReservaCoordenador`):**
   - Exclusiva para **Coordenador** no prédio/setor sob sua responsabilidade.
   - Repete semanalmente o(s) dia(s) da semana e horário nos horizontes `MENSAL` (1 mês), `SEMESTRAL` (6 meses), `ANUAL` (12 meses) ou `SEMANAL` (até `dataFim`).
4. **Cancelamento:**
   - Só é permitido **antes do horário de início** (`agora < dataHoraInicio`).
   - **Aluno / Técnico:** cancela somente a própria reserva (`solicitanteId === ator.id`).
   - **Professor:** cancela diretamente a própria reserva (`solicitanteId === ator.id`). Quando aciona o cancelamento em uma **reserva de Aluno**, o sistema **não cancela imediatamente**: identifica o departamento do responsável, registra uma solicitação/notificação para o Coordenador (`202 Accepted`) e aguarda a decisão do Coordenador.
   - **Coordenador:** pode cancelar qualquer reserva no seu escopo territorial antes do início.

---

## 3. Endpoints Implementados

### 3.1. `GET /usuarios/departamentos-elegiveis`
Lista os departamentos em que um Coordenador pode atuar. O catálogo é mantido em um documento do MongoDB e sincronizado ao iniciar a API.

- **Autenticação:** Não exigida (consulta usada no cadastro).
- **Resposta `200 OK`:**
  ```json
  [
    {
      "id": "gabinete-diretoria-geral",
      "nome": "Gabinete da Diretoria Geral",
      "diretoria": "Diretoria Geral",
      "sigla": "GABDG"
    },
    {
      "id": "ensino-geral",
      "nome": "Coordenadoria Geral de Ensino",
      "diretoria": "Diretoria de Ensino"
    }
  ]
  ```
- Cada item contém um identificador estável (`id`), o nome do departamento, sua diretoria e, quando aplicável, a sigla.

### 3.2. `GET /reservas`
Lista reservas cadastradas, ordenadas por `dataHoraInicio` crescente, enriquecidas com o campo calculado `diaDaSemana`.

- **Autenticação:** Obrigatória (`x-usuario-id`)
- **Query Params (todos opcionais):**
  - `salaId`: `ObjectId` da sala
  - `status`: `PENDENTE_APROVACAO | APROVADA | REJEITADA | CANCELADA | CONCLUIDA`
  - `solicitanteId`: `ObjectId` do solicitante
  - `responsavelId`: `ObjectId` do responsável
  - `data`: `AAAA-MM-DD` (filtra reservas com início nesse dia civil UTC)
- **Resposta `200 OK`:**
  ```json
  [
    {
      "id": "64b7f0c2a1b2c3d4e5f60718",
      "salaId": "64b7f0c2a1b2c3d4e5f60111",
      "solicitanteId": "64b7f0c2a1b2c3d4e5f60222",
      "responsavelId": "64b7f0c2a1b2c3d4e5f60333",
      "analisadoPorId": null,
      "serieRecorrenciaId": null,
      "tipoRecorrencia": "UNICA",
      "dataHoraInicio": "2026-10-21T13:00:00.000Z",
      "dataHoraFim": "2026-10-21T13:50:00.000Z",
      "finalidade": "Monitoria de Algoritmos",
      "observacoes": "Necessário projetor",
      "status": "PENDENTE_APROVACAO",
      "motivoRejeicao": null,
      "cancelamento": null,
      "criadoEm": "2026-10-20T12:00:00.000Z",
      "aceitoPeloResponsavelEm": null,
      "analisadoEm": null,
      "diaDaSemana": "QUARTA"
    }
  ]
  ```

---

### 3.3. `GET /reservas/:id`
Consulta os detalhes de uma reserva específica pelo seu ID, incluindo `diaDaSemana`.

- **Autenticação:** Obrigatória (`x-usuario-id`)
- **Parâmetros de Rota:** `id` (`ObjectId`)
- **Respostas:**
  - `200 OK`: Objeto da reserva (mesmo formato do item de `GET /reservas`).
  - `400 Bad Request`: ID em formato inválido.
  - `404 Not Found`: Reserva não encontrada.

---

### 3.4. `POST /reservas`
Cria uma reserva única ou uma série de reservas recorrentes.

- **Autenticação:** Obrigatória (`x-usuario-id`)
- **Corpo JSON:**
  ```json
  {
    "salaId": "64b7f0c2a1b2c3d4e5f60111",
    "dataHoraInicio": "2026-10-21T10:00:00-03:00",
    "dataHoraFim": "2026-10-21T10:50:00-03:00",
    "finalidade": "Aula de Engenharia de Software",
    "observacoes": "Turma do 4º período",
    "responsavelId": "64b7f0c2a1b2c3d4e5f60333",
    "recorrencia": {
      "tipo": "SEMESTRAL",
      "dataFim": "2027-03-21",
      "diasSemana": ["QUARTA"]
    }
  }
  ```
  - **Campos obrigatórios:** `salaId`, `dataHoraInicio`, `dataHoraFim`, `finalidade`.
  - **Campos condicionais/opcionais:**
    - `observacoes` *(opcional)*: texto livre.
    - `responsavelId`: **obrigatório para Aluno** (deve apontar para um Servidor/Coordenação ativo); opcional para Coordenador (permite delegar a outro Servidor); proibido ser diferente do próprio usuário para Professor e Técnico.
    - `recorrencia` *(exclusivo para Coordenador)*:
      - `tipo`: `SEMANAL | MENSAL | SEMESTRAL | ANUAL`.
      - `dataFim`: `AAAA-MM-DD` (obrigatório em `SEMANAL`; opcional em `MENSAL`/`SEMESTRAL`/`ANUAL`, que assumem 1, 6 ou 12 meses a partir da data inicial).
      - `diasSemana`: array de `DiaSemana` (obrigatório em `SEMANAL`; opcional em `MENSAL`/`SEMESTRAL`/`ANUAL`, que assumem o dia da semana de `dataHoraInicio` quando omitido).
      - Quando `recorrencia` não é informada, a reserva é persistida com `tipoRecorrencia: "UNICA"`.
- **Resposta `201 Created`:**
  ```json
  {
    "serieRecorrencia": null,
    "reservas": [
      {
        "id": "64b7f0c2a1b2c3d4e5f60718",
        "salaId": "64b7f0c2a1b2c3d4e5f60111",
        "solicitanteId": "64b7f0c2a1b2c3d4e5f60222",
        "responsavelId": "64b7f0c2a1b2c3d4e5f60333",
        "analisadoPorId": null,
        "serieRecorrenciaId": null,
        "tipoRecorrencia": "UNICA",
        "dataHoraInicio": "2026-10-21T13:00:00.000Z",
        "dataHoraFim": "2026-10-21T13:50:00.000Z",
        "finalidade": "Aula de Engenharia de Software",
        "observacoes": "Turma do 4º período",
        "status": "PENDENTE_APROVACAO",
        "motivoRejeicao": null,
        "cancelamento": null,
        "criadoEm": "2026-10-20T12:00:00.000Z",
        "aceitoPeloResponsavelEm": null,
        "analisadoEm": null,
        "diaDaSemana": "QUARTA"
      }
    ]
  }
  ```
- **Erros possíveis:**
  - `400 VALIDACAO`: campos ausentes ou formato inválido.
  - `403 PERMISSAO_NEGADA`: aluno sem responsável; professor/técnico tentando delegar ou criar recorrência.
  - `404 NAO_ENCONTRADO`: sala não encontrada.
  - `409 CONFLITO`: sala já possui reserva `APROVADA` sobreposta no horário solicitado.
  - `422 REGRA_DE_NEGOCIO`: duração diferente de 50 minutos; horário no passado ou fora da janela de funcionamento; menos de 12h de antecedência (Aluno/Técnico); mais de 2 reservas em 12h ou no mesmo dia (Aluno/Técnico); responsável indicado é Aluno, inexistente ou inativo; sala inativa.

---

### 3.5. `PATCH /reservas/:id/aceitar-responsabilidade`
Permite que o Servidor indicado como `responsavel` por um Aluno aceite a responsabilidade pela reserva e a encaminhe (via notificação) ao Coordenador do seu departamento. Esse aceite é obrigatório antes da aprovação final, mesmo quando o responsável também é o coordenador da sala; nesse caso, use esta rota primeiro e `PATCH /reservas/:id/aprovar` em seguida.

- **Autenticação:** Obrigatória (`x-usuario-id` deve ser o `responsavelId` da reserva e ser Servidor).
- **Parâmetros de Rota:** `id` (`ObjectId` da reserva).
- **Corpo JSON:** Não exigido (vazio `{}`).
- **Resposta `200 OK`:** Objeto da reserva atualizado com `aceitoPeloResponsavelEm` preenchido (status permanece `PENDENTE_APROVACAO` até a aprovação do Coordenador).
- **Erros possíveis:** `403 PERMISSAO_NEGADA`, `404 NAO_ENCONTRADO`, `409 CONFLITO` (se não estiver `PENDENTE_APROVACAO` ou já tiver sido aceita).

---

### 3.6. `PATCH /reservas/:id/aprovar`
Aprova uma reserva pendente (`PENDENTE_APROVACAO` $\rightarrow$ `APROVADA`).
- Se chamado pelo **Coordenador** do prédio/setor da sala: aprova definitivamente a reserva, desde que o servidor responsável já tenha aceitado quando o solicitante for diferente do responsável.
- Se chamado pelo **Servidor responsável** de uma reserva de Aluno (que não é coordenador da sala): executa automaticamente o aceite de responsabilidade (`aceitarResponsabilidade`).

- **Autenticação:** Obrigatória (`x-usuario-id`)
- **Parâmetros de Rota:** `id` (`ObjectId`)
- **Resposta `200 OK`:** Objeto da reserva atualizado.
- **Erros possíveis:**
  - `403 PERMISSAO_NEGADA`: usuário não é coordenador da sala nem servidor responsável pela reserva.
  - `409 CONFLITO`: reserva não está `PENDENTE_APROVACAO` ou há conflito de horário na sala.
  - `422 REGRA_DE_NEGOCIO`: coordenador tentou aprovar reserva de aluno antes do aceite do servidor responsável.

---

### 3.7. `PATCH /reservas/:id/rejeitar`
Rejeita uma reserva pendente (`PENDENTE_APROVACAO` $\rightarrow$ `REJEITADA`).

- **Autenticação:** Obrigatória (`x-usuario-id` — Coordenador do prédio/setor da sala)
- **Parâmetros de Rota:** `id` (`ObjectId`)
- **Corpo JSON:**
  ```json
  {
    "motivo": "Sala reservada para manutenção elétrica."
  }
  ```
- **Resposta `200 OK`:** Objeto da reserva atualizado com `status: "REJEITADA"` e `motivoRejeicao`.

---

### 3.8. `PATCH /reservas/:id/cancelar` (e `POST | PATCH /cancelamentos/:id/cancelar`)
Cancela uma reserva ou registra solicitação de cancelamento (quando um Professor solicita o cancelamento de uma reserva de Aluno para decisão do Coordenador). Ambos os caminhos utilizam o mesmo serviço central (`CancelamentoService`).

- **Autenticação:** Obrigatória (`x-usuario-id`)
- **Parâmetros de Rota:** `id` (`ObjectId`)
- **Corpo JSON:**
  ```json
  {
    "justificativa": "Imprevisto acadêmico / conflito de agenda."
  }
  ```
- **Respostas:**
  - **`200 OK` (Cancelamento efetivado — Aluno/Técnico/Professor na própria reserva, ou Coordenador):**
    ```json
    {
      "reserva": {
        "id": "64b7f0c2a1b2c3d4e5f60718",
        "status": "CANCELADA",
        "cancelamento": {
          "canceladoPorId": "64b7f0c2a1b2c3d4e5f60222",
          "justificativa": "Imprevisto acadêmico / conflito de agenda.",
          "canceladoEm": "2026-10-20T14:00:00.000Z"
        },
        "diaDaSemana": "QUARTA"
      },
      "solicitacaoEnviada": false,
      "mensagem": "Reserva cancelada com sucesso."
    }
    ```
  - **`202 Accepted` (Solicitação enviada ao Coordenador — Professor solicitando cancelamento de reserva de Aluno):**
    ```json
    {
      "reserva": null,
      "solicitacaoEnviada": true,
      "mensagem": "Solicitacao de cancelamento enviada ao coordenador do departamento para avaliacao."
    }
    ```
- **Erros possíveis:**
  - `400 VALIDACAO`: `justificativa` ausente ou vazia.
  - `403 PERMISSAO_NEGADA`: usuário sem permissão sobre a reserva.
  - `409 CONFLITO`: reserva já está `CANCELADA`, `REJEITADA` ou `CONCLUIDA`.
  - `422 REGRA_DE_NEGOCIO`: tentativa de cancelar após `dataHoraInicio` já ter iniciado.

---

### 3.9. `GET /cancelamentos/solicitacoes`
Lista as solicitações de cancelamento de reservas de alunos enviadas por professores e pendentes de avaliação pela coordenação.

- **Autenticação:** Obrigatória (`x-usuario-id`)
- **Resposta `200 OK`:**
  ```json
  [
    {
      "tipo": "SOLICITACAO_CANCELAMENTO",
      "reservaId": "64b7f0c2a1b2c3d4e5f60718",
      "solicitadoPorId": "64b7f0c2a1b2c3d4e5f60999",
      "departamentoId": "64b7f0c2a1b2c3d4e5f60444",
      "justificativa": "Conflito de horário com aula magna",
      "criadoEm": "2026-10-20T14:00:00.000Z"
    }
  ]
  ```

---

## 4. WebSocket de Notificações

### Conexão e autenticação

- **Endpoint:** `ws://<host>:3333/notificacoes/ws` em desenvolvimento. Use `wss://` em produção.
- **Autenticação:** inclua o JWT no cabeçalho HTTP do handshake: `Authorization: Bearer <token>`. O backend valida a assinatura e expiração do token e confirma no banco que o usuário existe e está ativo. Sem credenciais válidas, o servidor rejeita o handshake com HTTP `401`.
- **Destinatário:** os eventos são enviados somente às conexões autenticadas cujo usuário corresponda ao `solicitanteId` da reserva. O mesmo usuário pode estar conectado por mais de um dispositivo.

Exemplo para Flutter nativo (Android/iOS), usando `dart:io`:

```dart
import 'dart:convert';
import 'dart:io';

final WebSocket socket = await WebSocket.connect(
  'ws://10.0.2.2:3333/notificacoes/ws',
  headers: {'Authorization': 'Bearer $token'},
);

socket.listen(
  (mensagem) {
    final evento = jsonDecode(mensagem as String) as Map<String, dynamic>;
    switch (evento['tipo']) {
      case 'APROVACAO_RESERVA':
        // Atualize a interface: a reserva foi confirmada.
        break;
      case 'REJEICAO_RESERVA':
        final motivo = evento['motivo'];
        break;
      case 'CANCELAMENTO_RESERVA':
        final justificativa = evento['justificativa'];
        break;
    }
  },
  onError: (Object erro) {
    // Trate a falha e, se necessário, tente reconectar.
  },
  onDone: () {
    // A conexão foi encerrada.
  },
);
```

No emulador Android, `10.0.2.2` aponta para a máquina host. Em um dispositivo físico, substitua-o pelo IP ou domínio do servidor acessível pelo aparelho. Este exemplo é para Flutter nativo; clientes Flutter executados em navegador não podem definir livremente o cabeçalho `Authorization` no handshake WebSocket e precisam de outra estratégia de autenticação.

### Eventos e payloads

O backend envia um objeto JSON por evento. Datas são strings em ISO 8601.

```json
{
  "tipo": "APROVACAO_RESERVA",
  "reservaId": "64b7f0c2a1b2c3d4e5f60718",
  "solicitanteId": "64b7f0c2a1b2c3d4e5f60222",
  "alteradoPorId": "64b7f0c2a1b2c3d4e5f60333",
  "dataHoraInicio": "2026-10-21T13:00:00.000Z",
  "dataHoraFim": "2026-10-21T13:50:00.000Z",
  "criadoEm": "2026-10-19T16:00:00.000Z"
}
```

| `tipo` | Campos adicionais |
|---|---|
| `APROVACAO_RESERVA` | Nenhum |
| `REJEICAO_RESERVA` | `motivo` |
| `CANCELAMENTO_RESERVA` | `justificativa` |

Todos os eventos também incluem `reservaId`, `solicitanteId`, `alteradoPorId`, `dataHoraInicio`, `dataHoraFim` e `criadoEm`.

### Conexão interrompida

O WebSocket envia eventos somente enquanto o app está conectado. Não há histórico nem reenvio de notificações perdidas durante uma desconexão. O cliente deve tratar `onError`/`onDone`, reconectar quando apropriado e consultar a API REST para atualizar o estado das reservas.

---
