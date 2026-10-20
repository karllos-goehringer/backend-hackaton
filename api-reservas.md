# Documentação da API — Prédios, Salas, Usuários, Reservas e Cancelamentos

Esta documentação descreve os endpoints **efetivamente implementados** no backend (`Express 5 + Prisma 6.19 + MongoDB`) para consumo pelo frontend e app mobile.

---

## 1. Convenções Gerais

- **Base URL (desenvolvimento):** `http://localhost:3333`
- **Formato de dados:** `application/json`
- **Datas e Horários:**
  - Campos de instante (`dataHoraInicio`, `dataHoraFim`, `criadoEm`, `aceitoPeloResponsavelEm`, `analisadoEm`, `canceladoEm`) utilizam **ISO 8601 com fuso horário** (ex.: `2026-10-21T13:00:00-03:00` ou `2026-10-21T16:00:00.000Z`).
  - Datas civis (`dataFim` em recorrência e filtro `data`) utilizam o formato `AAAA-MM-DD`.
  - O fuso horário institucional considerado para cálculo de dia civil, horário de funcionamento e `diaDaSemana` é **`America/Sao_Paulo`**.
- **Identificadores (`id`, `predioId`, `salaId`, `responsavelId`, `solicitanteId`):**
  - Strings hexadecimais de 24 caracteres (`MongoDB ObjectId`, ex.: `"64b7f0c2a1b2c3d4e5f60718"`).
- **Autenticação (JWT Bearer):**
  - As rotas protegidas e o WebSocket leem o token JWT no cabeçalho:
    ```http
    Authorization: Bearer <token>
    ```
  - Caso o cabeçalho esteja ausente, inválido ou o usuário esteja inativo, a API retorna `401 Unauthorized` (ou rejeita o handshake WebSocket).
  - Rotas de leitura do catálogo de **Prédios** (`GET /predios`, `GET /predios/:id`, `GET /predios/:id/salas`) e **Salas** (`GET /salas`, `GET /salas/:id`) e departamentos elegíveis (`GET /usuarios/departamentos-elegiveis`) são públicas para consulta pelo frontend, enquanto rotas de escrita administrativa (`POST`, `PATCH`, `DELETE` em prédios e salas, e `POST /predios/seed`) exigem token JWT de **Coordenador** (`NivelAcesso.COORDENADOR = 2`).

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
  - `APROVADA` / `AGENDADO` *(equivale a `AGENDADO` no diagrama)*
  - `REJEITADA`
  - `CANCELADA` *(equivale a `CANCELADO` no diagrama)*
  - `CONCLUIDA` *(equivale a `CONCLUIDO` no diagrama)*
- **`TipoRecorrencia` (`Frequencia`):** `UNICA`, `SEMANAL`, `MENSAL`, `SEMESTRAL`, `ANUAL`
- **`DiaSemana`:** `DOMINGO`, `SEGUNDA`, `TERCA`, `QUARTA`, `QUINTA`, `SEXTA`, `SABADO`
- **`TipoSala` *(opcional)*:** `SALA_AULA`, `LABORATORIO`, `AUDITORIO`, `REUNIAO`

---

## 2. Fluxos de Negócio Resumidos

1. **Catálogo de Prédios e Salas (`Predio` 1—* `Sala`):**
   - Cada `Sala` pertence obrigatoriamente a um `Predio` (`predioId`).
   - O nome da sala (`nome` / `nomeSala`) é único **por prédio** (`@@unique([predioId, nomeSala])`), permitindo que salas com o mesmo nome existam em prédios distintos (ex.: `"Lab. de Física"` no `"Prédio TI"` com capacidade `16` e no `"Complexo de Laoratório"` com capacidade `20`; `"Sala 01"` no `"Prédio de Biologia"`).
   - Salas cuja capacidade não foi especificada no levantamento institucional (`"Sala 11 PP"`, `"Sala 12 PP"` e `"Lab. da Ciência do Café"`) possuem `capacidade: null` (nunca `0` ou valor arbitrário).
2. **Solicitação e Aprovação de Reservas:**
   - **Professor / Coordenador:** a reserva já nasce agendada (`AGENDADO` / `APROVADA`), desde que não haja conflito de horário na sala.
   - **Técnico:** solicita para si mesmo (`responsavelId` omitido ou igual ao próprio ID), com no mínimo **12h de antecedência**, respeitando o limite de **2 reservas a cada 12h e 2 por dia**. Nasce `PENDENTE_APROVACAO` e aguarda aprovação do Coordenador.
   - **Aluno:** deve obrigatoriamente informar `responsavelId` (um Servidor: Professor, Técnico ou Coordenador), com no mínimo **12h de antecedência** e limite de **2 reservas a cada 12h e 2 por dia**.
     - **Etapa 1:** o Servidor responsável aceita a reserva em `PATCH /reservas/:id/aceitar-responsabilidade` (ou `PATCH /reservas/:id/aprovar`, se não for coordenador da sala), que registra `aceitoPeloResponsavelEm` e notifica o coordenador do departamento do responsável.
     - **Etapa 2:** o Coordenador do prédio/setor aprova em `PATCH /reservas/:id/aprovar`, mudando o status para `APROVADA` (`AGENDADO`). Se o responsável também for o coordenador da sala, a aprovação direta em `/aprovar` cumpre ambas as etapas.
3. **Duração de Turno:**
   - Toda reserva deve ter duração exata de **50 minutos** (`dataHoraFim - dataHoraInicio === 50 min`).
4. **Recorrência (`ReservaCoordenador`):**
   - Exclusiva para **Coordenador** no prédio/setor sob sua responsabilidade.
   - Repete semanalmente o(s) dia(s) da semana e horário nos horizontes `MENSAL` (1 mês), `SEMESTRAL` (6 meses), `ANUAL` (12 meses) ou `SEMANAL` (até `dataFim`).
5. **Cancelamento:**
   - Só é permitido **antes do horário de início** (`agora < dataHoraInicio`).
   - **Aluno / Técnico:** cancela somente a própria reserva (`solicitanteId === ator.id`).
   - **Professor:** cancela diretamente a própria reserva (`solicitanteId === ator.id`). Quando aciona o cancelamento em uma **reserva de Aluno**, o sistema **não cancela imediatamente**: identifica o departamento do responsável, registra uma solicitação/notificação para o Coordenador (`202 Accepted`) e aguarda a decisão do Coordenador.
   - **Coordenador:** pode cancelar qualquer reserva no seu escopo territorial antes do início.

---

## 3. Endpoints de Usuários (`/usuarios`)

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

---

### 3.2. `GET /usuarios/me`
Retorna o perfil do usuário autenticado. Docentes com ao menos uma lotação de coordenação ativa recebem `nivelAcesso: 2` (`COORDENADOR`) e suas lotações ativas em `coordenacoes`.

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>`).
- **Resposta `200 OK`:** Perfil com dados pessoais básicos e os dados de aluno, servidor ou coordenações aplicáveis.

---

## 4. Endpoints de Prédios (`/predios`) e Salas (`/salas`)

### 4.1. `GET /predios`
Lista os prédios cadastrados em ordem alfabética de `nome`.

- **Autenticação:** Pública (não exige token)
- **Query Params (opcionais):**
  - `nome`: busca parcial case-insensitive pelo nome do prédio (ex.: `Pedagógico`, `TI`).
  - `incluirSalas`: `true | false` (padrão `false`). Quando `true`, retorna a lista de `salas` associadas a cada prédio.
  - `incluirInativas`: `true | false` (padrão `false`). Quando `incluirSalas=true`, define se salas inativas também são incluídas.
- **Resposta `200 OK` (`incluirSalas=false`):**
  ```json
  [
    {
      "id": "64b7f0c2a1b2c3d4e5f60010",
      "nome": "Complexo de Laoratório",
      "campusId": null,
      "setorId": null,
      "endereco": null
    },
    {
      "id": "64b7f0c2a1b2c3d4e5f60011",
      "nome": "Prédio Administrativo",
      "campusId": null,
      "setorId": null,
      "endereco": null
    }
  ]
  ```

---

### 4.2. `GET /predios/:id`
Consulta um prédio específico juntamente com todas as suas salas associadas.

- **Autenticação:** Pública
- **Parâmetros de Rota:** `id` (`ObjectId` do prédio)
- **Query Params (opcional):**
  - `incluirInativas`: `true | false` (padrão `false`)
- **Resposta `200 OK`:**
  ```json
  {
    "id": "64b7f0c2a1b2c3d4e5f60011",
    "nome": "Prédio Administrativo",
    "campusId": null,
    "setorId": null,
    "endereco": null,
    "salas": [
      {
        "id": "64b7f0c2a1b2c3d4e5f60101",
        "nome": "Auditório II",
        "nomeSala": "Auditório II",
        "capacidade": 200,
        "predioId": "64b7f0c2a1b2c3d4e5f60011",
        "ativa": true,
        "codigo": null,
        "numSala": null,
        "andar": null,
        "tipo": null
      },
      {
        "id": "64b7f0c2a1b2c3d4e5f60102",
        "nome": "Sala de Reunião B",
        "nomeSala": "Sala de Reunião B",
        "capacidade": 20,
        "predioId": "64b7f0c2a1b2c3d4e5f60011",
        "ativa": true,
        "codigo": null,
        "numSala": null,
        "andar": null,
        "tipo": null
      }
    ]
  }
  ```
- **Erros possíveis:** `400 VALIDACAO` (ID inválido), `404 NAO_ENCONTRADO` (prédio não encontrado).

---

### 4.3. `GET /predios/:id/salas`
Lista as salas pertencentes a um prédio específico, permitindo aplicar filtros adicionais de nome e capacidade diretamente no banco.

- **Autenticação:** Pública
- **Parâmetros de Rota:** `id` (`ObjectId` do prédio)
- **Query Params (opcionais):**
  - `nome`: busca parcial case-insensitive pelo nome da sala.
  - `capacidadeMin`: inteiro positivo ($\ge 1$). Filtra salas com `capacidade >= capacidadeMin` (exclui salas com `capacidade: null`).
  - `capacidadeMax`: inteiro positivo ($\ge 1$). Filtra salas com `capacidade <= capacidadeMax` (exclui salas com `capacidade: null`).
  - `apenasComCapacidade`: `true | false` — quando `true`, retorna apenas salas que possuem capacidade conhecida (`capacidade != null`).
  - `semCapacidade`: `true | false` — quando `true`, retorna apenas salas com capacidade não especificada (`capacidade === null`).
  - `tipo`: `SALA_AULA | LABORATORIO | AUDITORIO | REUNIAO`.
  - `incluirInativas`: `true | false` (padrão `false`).
- **Resposta `200 OK`:** Array de objetos `SalaComPredio` (mesmo formato de `GET /salas`).
- **Erros possíveis:** `400 VALIDACAO`, `404 NAO_ENCONTRADO` (se o prédio não existir).

---

### 4.4. `GET /salas`
Busca e filtra salas em todo o catálogo (com associação completa ao respectivo prédio para desambiguar salas de mesmo nome em prédios diferentes).

- **Autenticação:** Pública
- **Query Params (todos opcionais, aplicados no banco de dados):**
  - `predioId`: `ObjectId` do prédio.
  - `predioNome`: busca parcial case-insensitive pelo nome do prédio (ex.: `Biologia`, `Complexo de Laoratório`).
  - `nome`: busca parcial case-insensitive pelo nome da sala (ex.: `Lab. de Física`, `Sala 01`).
  - `capacidadeMin`: inteiro positivo ($\ge 1$).
  - `capacidadeMax`: inteiro positivo ($\ge 1$, $\ge \text{capacidadeMin}$).
  - `apenasComCapacidade`: `true | false`.
  - `semCapacidade`: `true | false`.
  - `tipo`: `SALA_AULA | LABORATORIO | AUDITORIO | REUNIAO`.
  - `incluirInativas`: `true | false` (padrão `false`).
- **Resposta `200 OK` (exemplo para `GET /salas?nome=Lab.%20de%20F%C3%ADsica`):**
  ```json
  [
    {
      "id": "64b7f0c2a1b2c3d4e5f60201",
      "nome": "Lab. de Física",
      "nomeSala": "Lab. de Física",
      "capacidade": 16,
      "predioId": "64b7f0c2a1b2c3d4e5f60015",
      "predio": {
        "id": "64b7f0c2a1b2c3d4e5f60015",
        "nome": "Prédio TI",
        "campusId": null,
        "setorId": null
      },
      "ativa": true,
      "codigo": null,
      "numSala": null,
      "andar": null,
      "tipo": null
    },
    {
      "id": "64b7f0c2a1b2c3d4e5f60202",
      "nome": "Lab. de Física",
      "nomeSala": "Lab. de Física",
      "capacidade": 20,
      "predioId": "64b7f0c2a1b2c3d4e5f60010",
      "predio": {
        "id": "64b7f0c2a1b2c3d4e5f60010",
        "nome": "Complexo de Laoratório",
        "campusId": null,
        "setorId": null
      },
      "ativa": true,
      "codigo": null,
      "numSala": null,
      "andar": null,
      "tipo": null
    }
  ]
  ```

---

### 4.5. `GET /salas/:id`
Consulta uma sala específica pelo seu `id` com os dados do prédio associado.

- **Autenticação:** Pública
- **Parâmetros de Rota:** `id` (`ObjectId` da sala)
- **Respostas:**
  - `200 OK`: Objeto `SalaComPredio`.
  - `400 VALIDACAO`: ID inválido.
  - `404 NAO_ENCONTRADO`: Sala não encontrada.

---

### 4.6. `POST /predios/seed` (e script CLI)
Executa a carga inicial idempotente dos **7 prédios e 59 salas** oficiais do IFES. Preserva registros existentes e não duplica prédios nem salas em execuções repetidas.
Também pode ser executado via linha de comando:
```bash
npx tsx src/features/predios/seed/executar-seed.ts
```

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>` — perfil `COORDENADOR`)
- **Resposta `200 OK`:**
  ```json
  {
    "prediosProcessados": 7,
    "prediosCriados": 7,
    "prediosExistentes": 0,
    "salasProcessadas": 59,
    "salasCriadas": 59,
    "salasExistentes": 0
  }
  ```

---

### 4.7. `POST /predios`, `PATCH /predios/:id`, `DELETE /predios/:id`
Gerenciamento de prédios (restrito a `COORDENADOR`).

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>` — `COORDENADOR`)
- **`POST /predios` — Corpo JSON:** `{ "nome": "Prédio de Pós-Graduação" }` $\rightarrow$ `201 Created` (`409 CONFLITO` se o nome já existir).
- **`PATCH /predios/:id` — Corpo JSON:** `{ "nome": "..." }` $\rightarrow$ `200 OK`.
- **`DELETE /predios/:id`:** `204 No Content` (`422 REGRA_DE_NEGOCIO` se o prédio possuir salas associadas).

---

### 4.8. `POST /salas`, `PATCH /salas/:id`, `DELETE /salas/:id`
Gerenciamento de salas (restrito a `COORDENADOR`).

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>` — `COORDENADOR`)
- **`POST /salas` — Corpo JSON:**
  ```json
  {
    "predioId": "64b7f0c2a1b2c3d4e5f60013",
    "nome": "Sala 11 PP",
    "capacidade": null
  }
  ```
  - Aceita `nome` ou `nomeSala`.
  - `capacidade`: inteiro positivo ($\ge 1$) ou `null` / omitido quando não especificada (`0` é rejeitado com `400 VALIDACAO`).
  - Resposta `201 Created`: objeto `SalaComPredio` (`404 NAO_ENCONTRADO` se `predioId` não existir; `409 CONFLITO` se já houver sala com mesmo nome no mesmo prédio).
- **`PATCH /salas/:id` — Corpo JSON:** campos parciais (`nome`, `capacidade`, `predioId`, `ativa`, `tipo`) $\rightarrow$ `200 OK`.
- **`DELETE /salas/:id`:** `204 No Content` (`422 REGRA_DE_NEGOCIO` se a sala possuir histórico de reservas — nesse caso, inative a sala com `{ "ativa": false }`).

---

## 5. Endpoints de Reservas (`/reservas`) e Cancelamentos (`/cancelamentos`)

### 5.1. `GET /reservas`
Lista reservas cadastradas, ordenadas por `dataHoraInicio` crescente, enriquecidas com o campo calculado `diaDaSemana` e objetos relacionados. Os IDs escalares existentes são mantidos; `sala`, `solicitante`, `responsavel`, `analisadoPor` e `serieRecorrencia` trazem os respectivos detalhes seguros para exibição. A sala inclui prédio, campus, setor e recursos. Usuários relacionados não incluem credenciais nem dados de autenticação.

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>`)
- **Query Params (todos opcionais):**
  - `salaId`: `ObjectId` da sala
  - `predioId`: `ObjectId` do prédio (filtra reservas de todas as salas pertencentes ao prédio)
  - `status`: `PENDENTE_APROVACAO | APROVADA | AGENDADO | REJEITADA | CANCELADA | CONCLUIDA`
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
      "diaDaSemana": "QUARTA",
      "sala": {
        "id": "64b7f0c2a1b2c3d4e5f60111",
        "codigo": "B1-S04",
        "numSala": 4,
        "nomeSala": "Laboratório de Informática",
        "andar": 1,
        "capacidade": 30,
        "tipo": "LABORATORIO",
        "ativa": true,
        "predio": {
          "id": "64b7f0c2a1b2c3d4e5f60112",
          "nome": "Bloco 1",
          "endereco": {
            "rua": "Avenida Principal",
            "numero": 100,
            "bairro": "Centro",
            "cep": "00000-000"
          },
          "campus": { "id": "64b7f0c2a1b2c3d4e5f60113", "nome": "Campus Alegre", "sigla": "ALEGRE" },
          "setor": { "id": "64b7f0c2a1b2c3d4e5f60114", "nome": "Setor Acadêmico", "sigla": "SA" }
        },
        "recursos": [{ "id": "64b7f0c2a1b2c3d4e5f60115", "descricao": "Projetor" }]
      },
      "solicitante": {
        "id": "64b7f0c2a1b2c3d4e5f60222",
        "nome": "Ana Silva",
        "tipoCredencial": "MATRICULA_ALUNO",
        "curso": { "id": "64b7f0c2a1b2c3d4e5f60223", "nome": "Sistemas para Internet" },
        "departamento": null
      },
      "responsavel": {
        "id": "64b7f0c2a1b2c3d4e5f60333",
        "nome": "João Souza",
        "tipoCredencial": "SIAPE_DOCENTE",
        "curso": null,
        "departamento": { "id": "64b7f0c2a1b2c3d4e5f60334", "nome": "Tecnologia da Informação" }
      },
      "analisadoPor": null,
      "serieRecorrencia": null
    }
  ]
  ```

---

### 5.2. `GET /reservas/:id`
Consulta os detalhes de uma reserva específica pelo seu ID, incluindo `diaDaSemana`.

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>`)
- **Parâmetros de Rota:** `id` (`ObjectId`)
- **Respostas:**
  - `200 OK`: Objeto da reserva (mesmo formato do item de `GET /reservas`).
  - `400 Bad Request`: ID em formato inválido.
  - `404 Not Found`: Reserva não encontrada.

---

### 5.3. `POST /reservas`
Cria uma reserva única ou uma série de reservas recorrentes.

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>`)
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
  - `409 CONFLITO`: sala já possui reserva `APROVADA`/`AGENDADO` sobreposta no horário solicitado.
  - `422 REGRA_DE_NEGOCIO`: duração diferente de 50 minutos; horário no passado ou fora da janela de funcionamento; menos de 12h de antecedência (Aluno/Técnico); mais de 2 reservas em 12h ou no mesmo dia (Aluno/Técnico); responsável indicado é Aluno, inexistente ou inativo; sala inativa.

---

### 5.4. `PATCH /reservas/:id/aceitar-responsabilidade`
Permite que o Servidor indicado como `responsavel` por um Aluno aceite a responsabilidade pela reserva e a encaminhe (via notificação) ao Coordenador do seu departamento.

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>` — deve ser o `responsavelId` da reserva e ser Servidor).
- **Parâmetros de Rota:** `id` (`ObjectId` da reserva).
- **Corpo JSON:** Não exigido (vazio `{}`).
- **Resposta `200 OK`:** Objeto da reserva atualizado com `aceitoPeloResponsavelEm` preenchido (status permanece `PENDENTE_APROVACAO` até a aprovação do Coordenador).
- **Erros possíveis:** `403 PERMISSAO_NEGADA`, `404 NAO_ENCONTRADO`, `409 CONFLITO` (se não estiver `PENDENTE_APROVACAO` ou já tiver sido aceita).

---

### 5.5. `PATCH /reservas/:id/aprovar`
Aprova uma reserva pendente (`PENDENTE_APROVACAO` $\rightarrow$ `APROVADA`).
- Se chamado pelo **Coordenador** do prédio/setor da sala: aprova definitivamente a reserva (desde que, no caso de reserva de Aluno, o servidor responsável já tenha aceitado ou seja o próprio Coordenador).
- Se chamado pelo **Servidor responsável** de uma reserva de Aluno (que não é coordenador da sala): executa automaticamente o aceite de responsabilidade (`aceitarResponsabilidade`).

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>`)
- **Parâmetros de Rota:** `id` (`ObjectId`)
- **Resposta `200 OK`:** Objeto da reserva atualizado.
- **Erros possíveis:**
  - `403 PERMISSAO_NEGADA`: usuário não é coordenador da sala nem servidor responsável pela reserva.
  - `409 CONFLITO`: reserva não está `PENDENTE_APROVACAO` ou há conflito de horário na sala.
  - `422 REGRA_DE_NEGOCIO`: coordenador tentou aprovar reserva de aluno antes do aceite do servidor responsável.

---

### 5.6. `PATCH /reservas/:id/rejeitar`
Rejeita uma reserva pendente (`PENDENTE_APROVACAO` $\rightarrow$ `REJEITADA`).

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>` — Coordenador do prédio/setor da sala)
- **Parâmetros de Rota:** `id` (`ObjectId`)
- **Corpo JSON:**
  ```json
  {
    "motivo": "Sala reservada para manutenção elétrica."
  }
  ```
- **Resposta `200 OK`:** Objeto da reserva atualizado com `status: "REJEITADA"` e `motivoRejeicao`.

---

### 5.7. `PATCH /reservas/:id/cancelar` (e `POST | PATCH /cancelamentos/:id/cancelar`)
Cancela uma reserva ou registra solicitação de cancelamento (quando um Professor solicita o cancelamento de uma reserva de Aluno para decisão do Coordenador). Ambos os caminhos utilizam o mesmo serviço central (`CancelamentoService`).

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>`)
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

### 5.8. `GET /cancelamentos/solicitacoes`
Lista as solicitações de cancelamento de reservas de alunos enviadas por professores e pendentes de avaliação pela coordenação.

- **Autenticação:** Obrigatória (`Authorization: Bearer <token>`)
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

## 6. WebSocket de Notificações

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

## 6. WebSocket de Notificações

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

