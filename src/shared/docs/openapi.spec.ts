export interface OpcoesOpenApi {
  baseUrl?: string;
}

export function construirEspecificacaoOpenApi(opcoes: OpcoesOpenApi = {}): Record<string, unknown> {
  const porta = Number(process.env.PORT) || 3333;
  const urlPadrao = opcoes.baseUrl ?? process.env.PUBLIC_API_URL?.trim() ?? `http://localhost:${porta}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "ReservaIF — API de Reservas de Salas e Laboratórios (IFES)",
      version: "1.0.0",
      description: [
        "API REST do sistema **ReservaIF** para gerenciamento de prédios, salas, laboratórios, solicitações de reserva, fluxo de aprovação por coordenação e cancelamentos no IFES.",
        "",
        "### Autenticação JWT (`Bearer`)",
        "1. Obtenha um token em `POST /autenticacao/login` informando `{ tipoEntrada, entrada, senha }`.",
        "2. Clique no botão **Authorize** no topo do Swagger UI e cole **apenas o valor do campo `token`** (sem o prefixo `Bearer `, pois o Swagger UI o adiciona automaticamente).",
        "3. Todas as rotas protegidas enviarão o cabeçalho `Authorization: Bearer <token>`.",
        "",
        "### Perfis de Acesso (`NivelAcesso`)",
        "- `0` — **ALUNO** (`MATRICULA_ALUNO`): solicita reservas com indicação obrigatória de servidor responsável (`responsavelId`), antecedência mínima de 12h e limite de 2 reservas a cada 12h e 2 por dia.",
        "- `1` — **PROFESSOR** (`SIAPE_DOCENTE` sem lotação de coordenação ativa): cria reservas com confirmação imediata (`APROVADA`), aceita responsabilidade de reservas de alunos e pode solicitar à coordenação o cancelamento de reserva de aluno.",
        "- `2` — **COORDENADOR** (`SIAPE_DOCENTE` com lotação ativa em `LotacaoCoordenacao`): gerencia prédios/salas, executa seed, aprova/rejeita/cancela reservas em seu escopo territorial e cria séries recorrentes (`SEMANAL`, `MENSAL`, `SEMESTRAL`, `ANUAL`).",
        "- `3` — **TECNICO** (`SIAPE_TECNICO`): solicita reservas para si mesmo (`PENDENTE_APROVACAO`) ou atua como responsável por reserva de aluno, sujeito à antecedência mínima de 12h e quota de 2 reservas/12h e 2/dia.",
        "",
        "### Regras Gerais de Agendamento",
        "- **Duração fixa do turno:** toda reserva deve ter exatamente **50 minutos** (`dataHoraFim - dataHoraInicio = 50 min`).",
        "- **Janela institucional:** funcionamento das `07:00` às `22:00` no fuso horário `America/Sao_Paulo` (`-03:00`).",
        "- **WebSocket de notificações em tempo real:** `ws://<host>:3333/notificacoes/ws` (exige cabeçalho `Authorization: Bearer <token>` no handshake).",
      ].join("\n"),
    },
    servers: [
      {
        url: urlPadrao,
        description: "Servidor da API ReservaIF",
      },
      {
        url: "/",
        description: "Servidor relativo (mesma origem do Swagger UI)",
      },
    ],
    tags: [
      {
        name: "Saúde",
        description: "Verificação de disponibilidade da API.",
      },
      {
        name: "Autenticação",
        description: "Emissão de token JWT (login por matrícula ou SIAPE).",
      },
      {
        name: "Usuários",
        description: "Cadastro de alunos e servidores, consulta de perfil autenticado e catálogo de departamentos elegíveis.",
      },
      {
        name: "Prédios",
        description: "Catálogo institucional de prédios, consulta das salas de um prédio e carga inicial idempotente (seed).",
      },
      {
        name: "Salas",
        description: "Busca e filtragem otimizada de salas e laboratórios por prédio, nome e capacidade, além de gestão administrativa.",
      },
      {
        name: "Reservas",
        description: "Solicitação de reservas únicas ou recorrentes, aceite de responsabilidade pelo servidor, aprovação/rejeição pela coordenação e cancelamento.",
      },
      {
        name: "Cancelamentos",
        description: "Cancelamento de reservas e consulta de solicitações de cancelamento enviadas por professores à coordenação.",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Informe o token JWT retornado por `POST /autenticacao/login`. Não inclua a palavra `Bearer` no campo abaixo.",
        },
      },
      parameters: {
        ObjectIdPathParam: {
          name: "id",
          in: "path",
          required: true,
          description: "Identificador MongoDB (`ObjectId` hexadecimal de 24 caracteres).",
          schema: {
            type: "string",
            pattern: "^[a-fA-F0-9]{24}$",
            example: "64b7f0c2a1b2c3d4e5f60718",
          },
        },
      },
      schemas: {
        ErroPadrao: {
          type: "object",
          required: ["erro", "mensagem"],
          properties: {
            erro: {
              type: "string",
              enum: [
                "VALIDACAO",
                "NAO_AUTENTICADO",
                "PERMISSAO_NEGADA",
                "NAO_ENCONTRADO",
                "CONFLITO",
                "REGRA_DE_NEGOCIO",
                "ERRO_INTERNO",
              ],
              example: "VALIDACAO",
            },
            mensagem: {
              type: "string",
              example: "Dados da requisicao invalidos.",
            },
            detalhes: {
              type: "object",
              additionalProperties: true,
              nullable: true,
            },
          },
        },
        HealthStatus: {
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              example: "ok",
            },
          },
        },
        AutenticarCredencialInput: {
          type: "object",
          required: ["tipoEntrada", "entrada", "senha"],
          properties: {
            tipoEntrada: {
              type: "integer",
              enum: [0, 1, 2],
              description: "Tipo de credencial: `0 = LOCAL`, `1 = CORPORATIVA`, `2 = OAUTH`.",
              example: 0,
            },
            entrada: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "Identificador de login (matrícula numérica do aluno ou SIAPE numérico do servidor).",
              example: "20261001",
            },
            senha: {
              type: "string",
              format: "password",
              description: "Senha cadastrada (mínimo de 8 bytes UTF-8).",
              example: "SenhaSegura@123",
            },
          },
        },
        CredencialAutenticada: {
          type: "object",
          required: ["uuid", "nivelAcesso", "token"],
          properties: {
            uuid: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              example: "64b7f0c2a1b2c3d4e5f60222",
            },
            nivelAcesso: {
              type: "integer",
              enum: [0, 1, 2, 3],
              description: "`0 = ALUNO`, `1 = PROFESSOR`, `2 = COORDENADOR`, `3 = TECNICO`.",
              example: 2,
            },
            token: {
              type: "string",
              description: "Token JWT assinado (HS256) para uso no cabeçalho `Authorization: Bearer <token>`.",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.exemplo.assinatura",
            },
          },
        },
        CriarCredencialInput: {
          type: "object",
          required: ["tipoEntrada", "entrada", "senha"],
          properties: {
            tipoEntrada: {
              type: "integer",
              enum: [0, 1, 2],
              description: "`0 = LOCAL`, `1 = CORPORATIVA`, `2 = OAUTH`.",
              example: 0,
            },
            entrada: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "Matrícula numérica (aluno) ou SIAPE numérico (servidor).",
              example: "20261001",
            },
            senha: {
              type: "string",
              minLength: 8,
              maxLength: 72,
              description: "Senha entre 8 e 72 bytes UTF-8.",
              example: "SenhaSegura@123",
            },
          },
        },
        CadastroUsuarioInput: {
          type: "object",
          required: ["nome", "email", "tipoCredencial", "credencial"],
          properties: {
            uuid: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "ObjectId opcional (gerado automaticamente quando omitido).",
              example: "64b7f0c2a1b2c3d4e5f60222",
            },
            nome: {
              type: "string",
              example: "Ana Clara Souza",
            },
            email: {
              type: "string",
              format: "email",
              example: "ana.souza@ifes.edu.br",
            },
            telefone: {
              type: "string",
              example: "(27) 99999-0000",
            },
            tipoCredencial: {
              type: "string",
              enum: ["MATRICULA_ALUNO", "SIAPE_DOCENTE", "SIAPE_TECNICO"],
              example: "MATRICULA_ALUNO",
            },
            credencial: {
              $ref: "#/components/schemas/CriarCredencialInput",
            },
            cursoId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "Obrigatório quando `tipoCredencial = MATRICULA_ALUNO`. Deve existir na coleção `cursos`.",
              example: "64b7f0c2a1b2c3d4e5f60001",
            },
            departamentoId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "Obrigatório quando `tipoCredencial = SIAPE_DOCENTE` ou `SIAPE_TECNICO`. Deve existir na coleção `departamentos`.",
              example: "64b7f0c2a1b2c3d4e5f60002",
            },
          },
        },
        UsuarioCadastrado: {
          type: "object",
          required: ["uuid", "nivelAcesso"],
          properties: {
            uuid: {
              type: "string",
              example: "64b7f0c2a1b2c3d4e5f60222",
            },
            nivelAcesso: {
              type: "integer",
              enum: [0, 1, 2, 3],
              example: 0,
            },
          },
        },
        DepartamentoElegivel: {
          type: "object",
          required: ["id", "nome", "diretoria"],
          properties: {
            id: {
              type: "string",
              example: "gabinete-diretoria-geral",
            },
            nome: {
              type: "string",
              example: "Gabinete da Diretoria Geral",
            },
            diretoria: {
              type: "string",
              example: "Diretoria Geral",
            },
            sigla: {
              type: "string",
              nullable: true,
              example: "GABDG",
            },
          },
        },
        PerfilUsuario: {
          type: "object",
          required: [
            "uuid",
            "nome",
            "email",
            "nivelAcesso",
            "role",
            "tipoCredencial",
            "identificador",
            "ativo",
            "criadoEm",
            "coordenacoes",
          ],
          properties: {
            uuid: { type: "string", example: "64b7f0c2a1b2c3d4e5f60333" },
            nome: { type: "string", example: "Prof. Carlos Mendes" },
            email: { type: "string", format: "email", example: "carlos.mendes@ifes.edu.br" },
            telefone: { type: "string", nullable: true, example: "(27) 98888-1111" },
            nivelAcesso: { type: "integer", enum: [0, 1, 2, 3], example: 2 },
            role: {
              type: "string",
              enum: ["ALUNO", "PROFESSOR", "COORDENADOR", "TECNICO"],
              example: "COORDENADOR",
            },
            tipoCredencial: {
              type: "string",
              enum: ["MATRICULA_ALUNO", "SIAPE_DOCENTE", "SIAPE_TECNICO"],
              example: "SIAPE_DOCENTE",
            },
            identificador: { type: "string", example: "1543210" },
            ativo: { type: "boolean", example: true },
            criadoEm: { type: "string", format: "date-time" },
            aluno: {
              type: "object",
              nullable: true,
              properties: {
                matricula: { type: "string" },
                curso: { type: "object", additionalProperties: true },
              },
            },
            servidor: {
              type: "object",
              nullable: true,
              properties: {
                siape: { type: "string" },
                departamento: { type: "object", additionalProperties: true },
              },
            },
            coordenacoes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
        Endereco: {
          type: "object",
          required: ["rua", "numero", "bairro", "cep"],
          properties: {
            rua: { type: "string", example: "Rodovia ES-080, Km 93" },
            numero: { type: "integer", minimum: 0, example: 100 },
            bairro: { type: "string", example: "São João de Petrópolis" },
            cep: { type: "string", example: "29660-000" },
          },
        },
        PredioResumo: {
          type: "object",
          required: ["id", "nome", "campusId", "setorId", "endereco"],
          properties: {
            id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60011" },
            nome: { type: "string", example: "Prédio Administrativo" },
            campusId: { type: "string", nullable: true, example: null },
            setorId: { type: "string", nullable: true, example: null },
            endereco: {
              allOf: [{ $ref: "#/components/schemas/Endereco" }],
              nullable: true,
            },
          },
        },
        SalaDoPredio: {
          type: "object",
          required: [
            "id",
            "nome",
            "nomeSala",
            "capacidade",
            "predioId",
            "ativa",
            "codigo",
            "numSala",
            "andar",
            "tipo",
          ],
          properties: {
            id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60101" },
            nome: { type: "string", example: "Auditório II" },
            nomeSala: { type: "string", example: "Auditório II" },
            capacidade: {
              type: "integer",
              nullable: true,
              description: "Capacidade máxima da sala ou `null` quando não especificada no levantamento institucional.",
              example: 200,
            },
            predioId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60011" },
            ativa: { type: "boolean", example: true },
            codigo: { type: "string", nullable: true, example: null },
            numSala: { type: "integer", nullable: true, example: null },
            andar: { type: "integer", nullable: true, example: null },
            tipo: {
              type: "string",
              enum: ["SALA_AULA", "LABORATORIO", "AUDITORIO", "REUNIAO"],
              nullable: true,
              example: null,
            },
          },
        },
        PredioComSalas: {
          allOf: [
            { $ref: "#/components/schemas/PredioResumo" },
            {
              type: "object",
              required: ["salas"],
              properties: {
                salas: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SalaDoPredio" },
                },
              },
            },
          ],
        },
        CriarPredioInput: {
          type: "object",
          required: ["nome"],
          properties: {
            nome: { type: "string", example: "Prédio de Pós-Graduação" },
            campusId: { type: "string", nullable: true, example: null },
            setorId: { type: "string", nullable: true, example: null },
            endereco: {
              allOf: [{ $ref: "#/components/schemas/Endereco" }],
              nullable: true,
            },
          },
        },
        AtualizarPredioInput: {
          type: "object",
          description: "Informe ao menos um campo para atualizar.",
          properties: {
            nome: { type: "string", example: "Prédio de Pesquisa e Pós-Graduação" },
            campusId: { type: "string", nullable: true },
            setorId: { type: "string", nullable: true },
            endereco: {
              allOf: [{ $ref: "#/components/schemas/Endereco" }],
              nullable: true,
            },
          },
        },
        ResultadoSeedPrediosSalas: {
          type: "object",
          required: [
            "prediosProcessados",
            "prediosCriados",
            "prediosExistentes",
            "salasProcessadas",
            "salasCriadas",
            "salasExistentes",
          ],
          properties: {
            prediosProcessados: { type: "integer", example: 7 },
            prediosCriados: { type: "integer", example: 7 },
            prediosExistentes: { type: "integer", example: 0 },
            salasProcessadas: { type: "integer", example: 59 },
            salasCriadas: { type: "integer", example: 59 },
            salasExistentes: { type: "integer", example: 0 },
          },
        },
        SalaComPredio: {
          allOf: [
            { $ref: "#/components/schemas/SalaDoPredio" },
            {
              type: "object",
              required: ["predio"],
              properties: {
                predio: {
                  type: "object",
                  required: ["id", "nome", "campusId", "setorId"],
                  properties: {
                    id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60015" },
                    nome: { type: "string", example: "Prédio TI" },
                    campusId: { type: "string", nullable: true, example: null },
                    setorId: { type: "string", nullable: true, example: null },
                  },
                },
              },
            },
          ],
        },
        CriarSalaInput: {
          type: "object",
          required: ["predioId"],
          description: "Informe `nome` (ou `nomeSala`) e `predioId`. `capacidade` aceita inteiro >= 1 ou `null`.",
          properties: {
            predioId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              example: "64b7f0c2a1b2c3d4e5f60013",
            },
            nome: {
              type: "string",
              description: "Nome da sala (alternativamente aceita `nomeSala`).",
              example: "Sala 13 PP",
            },
            nomeSala: {
              type: "string",
              example: "Sala 13 PP",
            },
            capacidade: {
              type: "integer",
              minimum: 1,
              nullable: true,
              description: "Inteiro positivo (`>= 1`) ou `null` quando não especificada. O valor `0` é rejeitado.",
              example: 35,
            },
            codigo: { type: "string", nullable: true, example: null },
            numSala: { type: "integer", minimum: 0, nullable: true, example: null },
            andar: { type: "integer", nullable: true, example: null },
            tipo: {
              type: "string",
              enum: ["SALA_AULA", "LABORATORIO", "AUDITORIO", "REUNIAO"],
              nullable: true,
              example: "SALA_AULA",
            },
            ativa: { type: "boolean", example: true },
          },
        },
        AtualizarSalaInput: {
          type: "object",
          description: "Informe ao menos um campo para atualizar a sala.",
          properties: {
            predioId: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            nome: { type: "string", example: "Sala 13 PP (Reformada)" },
            nomeSala: { type: "string" },
            capacidade: { type: "integer", minimum: 1, nullable: true, example: 40 },
            codigo: { type: "string", nullable: true },
            numSala: { type: "integer", minimum: 0, nullable: true },
            andar: { type: "integer", nullable: true },
            tipo: {
              type: "string",
              enum: ["SALA_AULA", "LABORATORIO", "AUDITORIO", "REUNIAO"],
              nullable: true,
            },
            ativa: { type: "boolean", example: true },
          },
        },
        CancelamentoEmbutido: {
          type: "object",
          required: ["canceladoPorId", "justificativa", "canceladoEm"],
          properties: {
            canceladoPorId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60222" },
            justificativa: { type: "string", example: "Imprevisto acadêmico." },
            canceladoEm: { type: "string", format: "date-time", example: "2026-10-20T14:00:00.000Z" },
          },
        },
        Reserva: {
          type: "object",
          required: [
            "id",
            "salaId",
            "solicitanteId",
            "responsavelId",
            "tipoRecorrencia",
            "dataHoraInicio",
            "dataHoraFim",
            "finalidade",
            "status",
            "criadoEm",
            "diaDaSemana",
          ],
          properties: {
            id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60718" },
            salaId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60111" },
            solicitanteId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60222" },
            responsavelId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60333" },
            analisadoPorId: { type: "string", nullable: true, example: null },
            serieRecorrenciaId: { type: "string", nullable: true, example: null },
            tipoRecorrencia: {
              type: "string",
              enum: ["UNICA", "SEMANAL", "MENSAL", "SEMESTRAL", "ANUAL"],
              example: "UNICA",
            },
            dataHoraInicio: {
              type: "string",
              format: "date-time",
              example: "2026-10-21T13:00:00.000Z",
            },
            dataHoraFim: {
              type: "string",
              format: "date-time",
              example: "2026-10-21T13:50:00.000Z",
            },
            finalidade: { type: "string", example: "Monitoria de Algoritmos" },
            observacoes: { type: "string", nullable: true, example: "Necessário projetor" },
            status: {
              type: "string",
              enum: ["PENDENTE_APROVACAO", "APROVADA", "AGENDADO", "REJEITADA", "CANCELADA", "CONCLUIDA"],
              example: "PENDENTE_APROVACAO",
            },
            motivoRejeicao: { type: "string", nullable: true, example: null },
            cancelamento: {
              allOf: [{ $ref: "#/components/schemas/CancelamentoEmbutido" }],
              nullable: true,
            },
            criadoEm: { type: "string", format: "date-time", example: "2026-10-20T12:00:00.000Z" },
            aceitoPeloResponsavelEm: { type: "string", format: "date-time", nullable: true, example: null },
            analisadoEm: { type: "string", format: "date-time", nullable: true, example: null },
            diaDaSemana: {
              type: "string",
              enum: ["DOMINGO", "SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"],
              example: "QUARTA",
            },
          },
        },
        SerieRecorrencia: {
          type: "object",
          required: [
            "id",
            "salaId",
            "criadoPorId",
            "tipo",
            "diasSemana",
            "horaInicio",
            "horaFim",
            "dataInicio",
            "dataFim",
            "criadoEm",
          ],
          properties: {
            id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60888" },
            salaId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60111" },
            criadoPorId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60333" },
            tipo: {
              type: "string",
              enum: ["SEMANAL", "MENSAL", "SEMESTRAL", "ANUAL"],
              example: "SEMESTRAL",
            },
            diasSemana: {
              type: "array",
              items: {
                type: "string",
                enum: ["DOMINGO", "SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"],
              },
              example: ["QUARTA"],
            },
            horaInicio: { type: "string", example: "10:00" },
            horaFim: { type: "string", example: "10:50" },
            dataInicio: { type: "string", format: "date-time" },
            dataFim: { type: "string", format: "date-time" },
            criadoEm: { type: "string", format: "date-time" },
          },
        },
        RegraRecorrenciaInput: {
          type: "object",
          required: ["tipo"],
          description:
            "Exclusivo para Coordenador. Em `SEMANAL`, `dataFim` e `diasSemana` são obrigatórios. Em `MENSAL`, `SEMESTRAL` e `ANUAL`, o horizonte e o dia da semana são calculados automaticamente quando omitidos.",
          properties: {
            tipo: {
              type: "string",
              enum: ["SEMANAL", "MENSAL", "SEMESTRAL", "ANUAL"],
              example: "SEMESTRAL",
            },
            dataFim: {
              type: "string",
              format: "date",
              example: "2027-03-21",
            },
            diasSemana: {
              type: "array",
              items: {
                type: "string",
                enum: ["DOMINGO", "SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"],
              },
              example: ["QUARTA"],
            },
          },
        },
        CriarReservaInput: {
          type: "object",
          required: ["salaId", "dataHoraInicio", "dataHoraFim", "finalidade"],
          properties: {
            salaId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              example: "64b7f0c2a1b2c3d4e5f60111",
            },
            dataHoraInicio: {
              type: "string",
              format: "date-time",
              description: "ISO 8601 com fuso horário (ex.: `2026-10-25T10:00:00-03:00`).",
              example: "2026-10-25T10:00:00-03:00",
            },
            dataHoraFim: {
              type: "string",
              format: "date-time",
              description: "Deve ser exatamente 50 minutos após `dataHoraInicio`.",
              example: "2026-10-25T10:50:00-03:00",
            },
            finalidade: {
              type: "string",
              example: "Aula prática de Engenharia de Software",
            },
            observacoes: {
              type: "string",
              example: "Turma do 4º período",
            },
            responsavelId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description:
                "Obrigatório para `ALUNO` (deve ser um Servidor ativo). Opcional para `COORDENADOR`. Não permitido delegar para outro usuário quando solicitante é `PROFESSOR` ou `TECNICO`.",
              example: "64b7f0c2a1b2c3d4e5f60333",
            },
            recorrencia: {
              $ref: "#/components/schemas/RegraRecorrenciaInput",
            },
          },
        },
        ResultadoCriacaoReserva: {
          type: "object",
          required: ["serieRecorrencia", "reservas"],
          properties: {
            serieRecorrencia: {
              allOf: [{ $ref: "#/components/schemas/SerieRecorrencia" }],
              nullable: true,
            },
            reservas: {
              type: "array",
              items: { $ref: "#/components/schemas/Reserva" },
            },
          },
        },
        RejeitarReservaInput: {
          type: "object",
          required: ["motivo"],
          properties: {
            motivo: {
              type: "string",
              example: "Sala reservada para manutenção elétrica programada.",
            },
          },
        },
        CancelarReservaInput: {
          type: "object",
          required: ["justificativa"],
          properties: {
            justificativa: {
              type: "string",
              example: "Imprevisto acadêmico / conflito de agenda.",
            },
          },
        },
        ResultadoCancelamento: {
          type: "object",
          required: ["reserva", "solicitacaoEnviada", "mensagem"],
          properties: {
            reserva: {
              allOf: [{ $ref: "#/components/schemas/Reserva" }],
              nullable: true,
            },
            solicitacaoEnviada: {
              type: "boolean",
              example: false,
            },
            mensagem: {
              type: "string",
              example: "Reserva cancelada com sucesso.",
            },
          },
        },
        NotificacaoCancelamento: {
          type: "object",
          required: ["tipo", "reservaId", "solicitadoPorId", "justificativa", "criadoEm"],
          properties: {
            tipo: {
              type: "string",
              enum: ["SOLICITACAO_CANCELAMENTO"],
              example: "SOLICITACAO_CANCELAMENTO",
            },
            reservaId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60718" },
            solicitadoPorId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60999" },
            departamentoId: { type: "string", nullable: true, example: "64b7f0c2a1b2c3d4e5f60444" },
            justificativa: { type: "string", example: "Conflito com avaliação departamental." },
            criadoEm: { type: "string", format: "date-time", example: "2026-10-20T14:00:00.000Z" },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Saúde"],
          summary: "Verificar disponibilidade da API",
          description: "Retorna `200 OK` quando o processo HTTP da API está ativo.",
          security: [],
          responses: {
            "200": {
              description: "API operacional.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthStatus" },
                },
              },
            },
          },
        },
      },
      "/autenticacao/login": {
        post: {
          tags: ["Autenticação"],
          summary: "Autenticar usuário e emitir token JWT",
          description:
            "Valida a credencial (`tipoEntrada`, `entrada` e `senha`) de um usuário ativo e retorna `{ uuid, nivelAcesso, token }`. Docentes com lotação de coordenação ativa recebem `nivelAcesso = 2` (`COORDENADOR`).",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AutenticarCredencialInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Autenticação realizada com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CredencialAutenticada" },
                },
              },
            },
            "400": {
              description: "Campos obrigatórios ausentes ou tipo de entrada inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Credenciais inválidas ou usuário inativo (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/autenticacao": {
        post: {
          tags: ["Autenticação"],
          summary: "Autenticar usuário (rota alternativa para /autenticacao/login)",
          description: "Alias funcional para `POST /autenticacao/login`.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AutenticarCredencialInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Autenticação realizada com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CredencialAutenticada" },
                },
              },
            },
            "400": {
              description: "Erro de validação.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Credenciais inválidas.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/usuarios/departamentos-elegiveis": {
        get: {
          tags: ["Usuários"],
          summary: "Listar departamentos elegíveis para coordenação",
          description: "Retorna o catálogo institucional de departamentos sincronizado no banco de dados.",
          security: [],
          responses: {
            "200": {
              description: "Lista de departamentos elegíveis.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/DepartamentoElegivel" },
                  },
                },
              },
            },
          },
        },
      },
      "/usuarios": {
        post: {
          tags: ["Usuários"],
          summary: "Cadastrar usuário (aluno ou servidor)",
          description:
            "Cadastra um novo usuário e sua credencial. Para `SIAPE_DOCENTE` ou `SIAPE_TECNICO`, é obrigatório informar o cabeçalho `x-provision-key` correspondente a `USER_PROVISION_KEY`. Para `MATRICULA_ALUNO`, o cabeçalho não é necessário.",
          security: [],
          parameters: [
            {
              name: "x-provision-key",
              in: "header",
              required: false,
              description:
                "Chave de provisionamento obrigatória apenas para cadastro de servidores (`SIAPE_DOCENTE` e `SIAPE_TECNICO`).",
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroUsuarioInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Usuário cadastrado com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UsuarioCadastrado" },
                },
              },
            },
            "400": {
              description: "Dados de cadastro inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Chave `x-provision-key` ausente ou inválida ao cadastrar servidor (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "UUID, e-mail, matrícula, SIAPE ou entrada de credencial já cadastrados (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/usuarios/alunos": {
        post: {
          tags: ["Usuários"],
          summary: "Cadastrar aluno (rota alias de POST /usuarios)",
          description: "Atalho de rota para `POST /usuarios` voltado ao cadastro de alunos (`MATRICULA_ALUNO`).",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroUsuarioInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Aluno cadastrado com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UsuarioCadastrado" },
                },
              },
            },
            "400": {
              description: "Dados inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Registro duplicado (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/usuarios/servidores": {
        post: {
          tags: ["Usuários"],
          summary: "Cadastrar servidor docente ou técnico (rota alias de POST /usuarios)",
          description:
            "Atalho de rota para `POST /usuarios` voltado ao cadastro de servidores (`SIAPE_DOCENTE` / `SIAPE_TECNICO`). Exige cabeçalho `x-provision-key`.",
          security: [],
          parameters: [
            {
              name: "x-provision-key",
              in: "header",
              required: true,
              description: "Chave de provisionamento (`USER_PROVISION_KEY`).",
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroUsuarioInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Servidor cadastrado com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UsuarioCadastrado" },
                },
              },
            },
            "400": {
              description: "Dados inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Provisionamento não autorizado (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Registro duplicado (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/usuarios/me": {
        get: {
          tags: ["Usuários"],
          summary: "Consultar perfil do usuário autenticado",
          description:
            "Retorna os dados do usuário correspondente ao token JWT, incluindo `nivelAcesso`, `role`, vínculo de aluno/servidor e lotações de coordenação ativas.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Perfil do usuário autenticado.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PerfilUsuario" },
                },
              },
            },
            "401": {
              description: "Token ausente, inválido ou expirado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Perfil não encontrado (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/predios": {
        get: {
          tags: ["Prédios"],
          summary: "Listar prédios",
          description:
            "Lista os prédios cadastrados em ordem alfabética de `nome`. Permite buscar por nome parcial e opcionalmente incluir a lista de salas de cada prédio.",
          security: [],
          parameters: [
            {
              name: "nome",
              in: "query",
              required: false,
              description: "Filtro parcial case-insensitive pelo nome do prédio (ex.: `Pedagógico`, `TI`).",
              schema: { type: "string" },
            },
            {
              name: "incluirSalas",
              in: "query",
              required: false,
              description: "Quando `true`, inclui o array `salas` em cada prédio retornado.",
              schema: { type: "boolean", default: false },
            },
            {
              name: "incluirInativas",
              in: "query",
              required: false,
              description: "Quando `incluirSalas=true`, define se salas inativas também devem ser listadas.",
              schema: { type: "boolean", default: false },
            },
          ],
          responses: {
            "200": {
              description: "Lista de prédios.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      oneOf: [
                        { $ref: "#/components/schemas/PredioResumo" },
                        { $ref: "#/components/schemas/PredioComSalas" },
                      ],
                    },
                  },
                },
              },
            },
            "400": {
              description: "Parâmetros de filtro inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Prédios"],
          summary: "Criar prédio (Coordenador)",
          description: "Cadastra um novo prédio. Requer usuário autenticado com perfil `COORDENADOR` (`nivelAcesso = 2`).",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CriarPredioInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Prédio criado com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PredioResumo" },
                },
              },
            },
            "400": {
              description: "Dados inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Apenas coordenadores podem criar prédios (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Já existe um prédio com o mesmo nome (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/predios/seed": {
        post: {
          tags: ["Prédios"],
          summary: "Executar carga inicial idempotente de prédios e salas (Coordenador)",
          description:
            "Popula de forma idempotente os **7 prédios e 59 salas** oficiais do levantamento institucional do IFES (incluindo salas com `capacidade: null` onde não especificada). Não duplica registros existentes.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Resumo da execução do seed.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResultadoSeedPrediosSalas" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Apenas coordenadores podem executar o seed (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/predios/{id}": {
        get: {
          tags: ["Prédios"],
          summary: "Buscar prédio por ID com suas salas",
          description: "Retorna os dados do prédio e a lista de salas associadas a ele.",
          security: [],
          parameters: [
            { $ref: "#/components/parameters/ObjectIdPathParam" },
            {
              name: "incluirInativas",
              in: "query",
              required: false,
              description: "Quando `true`, inclui também as salas inativas do prédio.",
              schema: { type: "boolean", default: false },
            },
          ],
          responses: {
            "200": {
              description: "Prédio encontrado com suas salas.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PredioComSalas" },
                },
              },
            },
            "400": {
              description: "ID de prédio inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Prédio não encontrado (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
        patch: {
          tags: ["Prédios"],
          summary: "Atualizar prédio (Coordenador)",
          description: "Atualiza parcialmente os dados de um prédio existente.",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AtualizarPredioInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Prédio atualizado.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PredioResumo" },
                },
              },
            },
            "400": {
              description: "Dados inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Sem permissão (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Prédio não encontrado (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Nome de prédio duplicado (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Prédios"],
          summary: "Remover prédio (Coordenador)",
          description:
            "Remove um prédio que não possua salas associadas. Caso possua salas vinculadas, retorna `422 REGRA_DE_NEGOCIO`.",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          responses: {
            "204": {
              description: "Prédio removido com sucesso.",
            },
            "400": {
              description: "ID inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Sem permissão (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Prédio não encontrado (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "422": {
              description: "Não é possível remover um prédio que possui salas associadas (`REGRA_DE_NEGOCIO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/predios/{id}/salas": {
        get: {
          tags: ["Prédios"],
          summary: "Listar salas de um prédio específico",
          description:
            "Lista as salas pertencentes ao prédio informado, permitindo aplicar filtros adicionais de nome, faixa de capacidade e status.",
          security: [],
          parameters: [
            { $ref: "#/components/parameters/ObjectIdPathParam" },
            {
              name: "nome",
              in: "query",
              required: false,
              description: "Busca parcial case-insensitive pelo nome da sala.",
              schema: { type: "string" },
            },
            {
              name: "capacidadeMin",
              in: "query",
              required: false,
              description: "Capacidade mínima (`>= 1`). Exclui salas com `capacidade: null`.",
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "capacidadeMax",
              in: "query",
              required: false,
              description: "Capacidade máxima (`>= 1`). Exclui salas com `capacidade: null`.",
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "apenasComCapacidade",
              in: "query",
              required: false,
              description: "Quando `true`, retorna apenas salas com `capacidade != null`.",
              schema: { type: "boolean" },
            },
            {
              name: "semCapacidade",
              in: "query",
              required: false,
              description: "Quando `true`, retorna apenas salas com `capacidade == null`.",
              schema: { type: "boolean" },
            },
            {
              name: "tipo",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["SALA_AULA", "LABORATORIO", "AUDITORIO", "REUNIAO"],
              },
            },
            {
              name: "incluirInativas",
              in: "query",
              required: false,
              schema: { type: "boolean", default: false },
            },
          ],
          responses: {
            "200": {
              description: "Lista de salas do prédio.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/SalaComPredio" },
                  },
                },
              },
            },
            "400": {
              description: "ID ou filtros inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Prédio não encontrado (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/salas": {
        get: {
          tags: ["Salas"],
          summary: "Listar e filtrar salas",
          description:
            "Busca salas em todo o catálogo aplicando filtros diretamente no MongoDB. Sempre inclui o objeto `predio` para desambiguar salas de mesmo nome em prédios distintos (ex.: `Lab. de Física` no `Prédio TI` e no `Complexo de Laoratório`).",
          security: [],
          parameters: [
            {
              name: "predioId",
              in: "query",
              required: false,
              description: "Filtra pelo ObjectId do prédio.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
            {
              name: "predioNome",
              in: "query",
              required: false,
              description: "Busca parcial case-insensitive pelo nome do prédio.",
              schema: { type: "string" },
            },
            {
              name: "nome",
              in: "query",
              required: false,
              description: "Busca parcial case-insensitive pelo nome da sala.",
              schema: { type: "string" },
            },
            {
              name: "capacidadeMin",
              in: "query",
              required: false,
              description: "Capacidade mínima (`>= 1`). Exclui salas com `capacidade: null`.",
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "capacidadeMax",
              in: "query",
              required: false,
              description: "Capacidade máxima (`>= 1`, `>= capacidadeMin`). Exclui salas com `capacidade: null`.",
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "apenasComCapacidade",
              in: "query",
              required: false,
              description: "Retorna apenas salas com capacidade conhecida (`!= null`).",
              schema: { type: "boolean" },
            },
            {
              name: "semCapacidade",
              in: "query",
              required: false,
              description: "Retorna apenas salas sem capacidade especificada (`null`).",
              schema: { type: "boolean" },
            },
            {
              name: "tipo",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["SALA_AULA", "LABORATORIO", "AUDITORIO", "REUNIAO"],
              },
            },
            {
              name: "incluirInativas",
              in: "query",
              required: false,
              schema: { type: "boolean", default: false },
            },
          ],
          responses: {
            "200": {
              description: "Lista de salas filtradas com o respectivo prédio.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/SalaComPredio" },
                  },
                },
              },
            },
            "400": {
              description: "Filtros inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Salas"],
          summary: "Criar sala (Coordenador)",
          description:
            "Cadastra uma nova sala associada a um prédio existente. O nome da sala é único por prédio (`@@unique([predioId, nomeSala])`).",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CriarSalaInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Sala criada com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SalaComPredio" },
                },
              },
            },
            "400": {
              description: "Dados inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Apenas coordenadores podem criar salas (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Prédio informado não encontrado (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Já existe sala com o mesmo nome neste prédio (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/salas/{id}": {
        get: {
          tags: ["Salas"],
          summary: "Buscar sala por ID",
          description: "Retorna os detalhes de uma sala específica e os dados do prédio ao qual pertence.",
          security: [],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          responses: {
            "200": {
              description: "Sala encontrada.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SalaComPredio" },
                },
              },
            },
            "400": {
              description: "ID inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Sala não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
        patch: {
          tags: ["Salas"],
          summary: "Atualizar sala (Coordenador)",
          description: "Atualiza parcialmente os dados de uma sala (nome, capacidade, prédio, status `ativa`, etc.).",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AtualizarSalaInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Sala atualizada com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SalaComPredio" },
                },
              },
            },
            "400": {
              description: "Dados inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Sem permissão (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Sala ou prédio de destino não encontrado (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Conflito de nome de sala no mesmo prédio (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["Salas"],
          summary: "Remover sala (Coordenador)",
          description:
            "Remove uma sala que não possua histórico de reservas. Se houver reservas vinculadas, retorna `422 REGRA_DE_NEGOCIO` orientando a inativação (`PATCH /salas/:id` com `{ \"ativa\": false }`).",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          responses: {
            "204": {
              description: "Sala removida com sucesso.",
            },
            "400": {
              description: "ID inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Sem permissão (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Sala não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "422": {
              description: "Sala possui histórico de reservas (`REGRA_DE_NEGOCIO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/reservas": {
        get: {
          tags: ["Reservas"],
          summary: "Listar reservas",
          description:
            "Lista as reservas ordenadas por `dataHoraInicio` crescente, enriquecidas com o campo calculado `diaDaSemana`.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "salaId",
              in: "query",
              required: false,
              description: "Filtra pelo ObjectId da sala.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
            {
              name: "predioId",
              in: "query",
              required: false,
              description: "Filtra reservas de todas as salas pertencentes ao prédio informado.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
            {
              name: "solicitanteId",
              in: "query",
              required: false,
              description: "Filtra pelo ObjectId do usuário solicitante.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
            {
              name: "responsavelId",
              in: "query",
              required: false,
              description: "Filtra pelo ObjectId do servidor responsável.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["PENDENTE_APROVACAO", "APROVADA", "AGENDADO", "REJEITADA", "CANCELADA", "CONCLUIDA"],
              },
            },
            {
              name: "data",
              in: "query",
              required: false,
              description: "Filtra reservas com início na data civil informada (`AAAA-MM-DD`).",
              schema: { type: "string", format: "date", example: "2026-10-25" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de reservas.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Reserva" },
                  },
                },
              },
            },
            "400": {
              description: "Filtros inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
        post: {
          tags: ["Reservas"],
          summary: "Solicitar ou agendar reserva (única ou recorrente)",
          description: [
            "Cria uma reserva única ou uma série recorrente conforme o perfil do usuário autenticado:",
            "- **Professor / Coordenador:** nasce `APROVADA` imediatamente, validando ausência de conflito na sala.",
            "- **Técnico:** nasce `PENDENTE_APROVACAO`, exige 12h de antecedência e respeita o limite de 2 reservas/12h e 2/dia.",
            "- **Aluno:** nasce `PENDENTE_APROVACAO`, exige informar `responsavelId` (Servidor ativo), 12h de antecedência e limite de 2 reservas/12h e 2/dia.",
            "- **Recorrência (`recorrencia`):** exclusiva para `COORDENADOR` dentro do prédio/setor sob sua coordenação.",
          ].join("\n"),
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CriarReservaInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Reserva(s) criada(s) com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResultadoCriacaoReserva" },
                },
              },
            },
            "400": {
              description: "Formato de payload inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Violação de política de perfil (aluno sem responsável, delegação não permitida ou recorrência fora do escopo de coordenação — `PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Sala não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Conflito de horário com reserva já aprovada/agendada na mesma sala (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "422": {
              description:
                "Violação de regra de negócio: duração diferente de 50 min, fora do horário de funcionamento (07:00–22:00), antecedência < 12h, limite de 2 reservas/12h ou 2/dia excedido, responsável inválido ou sala inativa (`REGRA_DE_NEGOCIO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/reservas/{id}": {
        get: {
          tags: ["Reservas"],
          summary: "Buscar reserva por ID",
          description: "Retorna os detalhes de uma reserva específica pelo seu `ObjectId`, enriquecida com `diaDaSemana`.",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          responses: {
            "200": {
              description: "Reserva encontrada.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Reserva" },
                },
              },
            },
            "400": {
              description: "ID inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Reserva não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/reservas/{id}/aceitar-responsabilidade": {
        patch: {
          tags: ["Reservas"],
          summary: "Aceitar responsabilidade por reserva de aluno (Servidor responsável)",
          description:
            "Etapa 1 do fluxo de reserva de aluno: o servidor (`PROFESSOR`, `TECNICO` ou `COORDENADOR`) indicado em `responsavelId` registra seu aceite (`aceitoPeloResponsavelEm`) e encaminha a solicitação ao coordenador do departamento.",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          responses: {
            "200": {
              description: "Responsabilidade aceita e encaminhada à coordenação.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Reserva" },
                },
              },
            },
            "400": {
              description: "ID inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Apenas o servidor indicado como responsável pode aceitar (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Reserva não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Reserva não está pendente ou já teve a responsabilidade aceita (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/reservas/{id}/aprovar": {
        patch: {
          tags: ["Reservas"],
          summary: "Aprovar reserva pendente (Coordenador ou Servidor responsável)",
          description: [
            "Processa a aprovação de uma reserva com status `PENDENTE_APROVACAO`:",
            "- Se acionado pelo **Coordenador** responsável pelo prédio/setor da sala: aprova definitivamente (`status = APROVADA`), desde que reservas delegadas/de aluno já tenham sido aceitas pelo servidor responsável.",
            "- Se acionado pelo **Servidor responsável** de uma reserva de aluno (que não seja o coordenador da sala): registra o aceite de responsabilidade (Etapa 1).",
          ].join("\n"),
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          responses: {
            "200": {
              description: "Reserva aprovada (ou responsabilidade aceita).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Reserva" },
                },
              },
            },
            "400": {
              description: "ID inválido (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Usuário não é coordenador da sala nem servidor responsável (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Reserva não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Status inválido para aprovação ou conflito de horário na sala (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "422": {
              description: "Reserva de aluno ainda não foi aceita pelo servidor responsável (`REGRA_DE_NEGOCIO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/reservas/{id}/rejeitar": {
        patch: {
          tags: ["Reservas"],
          summary: "Rejeitar reserva pendente (Coordenador)",
          description:
            "Rejeita uma reserva com status `PENDENTE_APROVACAO` no prédio/setor sob responsabilidade do coordenador, exigindo um `motivo`.",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RejeitarReservaInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Reserva rejeitada com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Reserva" },
                },
              },
            },
            "400": {
              description: "ID inválido ou `motivo` ausente (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Apenas o coordenador da sala pode rejeitar (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Reserva não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Reserva não está em status que permita rejeição (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/reservas/{id}/cancelar": {
        patch: {
          tags: ["Reservas"],
          summary: "Cancelar reserva ou solicitar cancelamento à coordenação",
          description: [
            "Cancela uma reserva antes do seu horário de início (`agora < dataHoraInicio`) ou registra solicitação de cancelamento:",
            "- **Aluno / Técnico:** cancela apenas a própria reserva (`200 OK`).",
            "- **Professor:** cancela a própria reserva (`200 OK`) ou, tratando-se de reserva de aluno, registra solicitação para o coordenador do departamento do responsável (`202 Accepted`).",
            "- **Coordenador:** cancela qualquer reserva em seu escopo (`200 OK`).",
          ].join("\n"),
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CancelarReservaInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Reserva cancelada imediatamente (`solicitacaoEnviada: false`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResultadoCancelamento" },
                },
              },
            },
            "202": {
              description:
                "Solicitação de cancelamento de reserva de aluno enviada ao coordenador (`solicitacaoEnviada: true`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResultadoCancelamento" },
                },
              },
            },
            "400": {
              description: "ID inválido ou `justificativa` ausente (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Sem permissão para cancelar a reserva (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Reserva não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Reserva já cancelada, rejeitada ou concluída (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "422": {
              description: "Horário da reserva já iniciou (`REGRA_DE_NEGOCIO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/cancelamentos/solicitacoes": {
        get: {
          tags: ["Cancelamentos"],
          summary: "Listar solicitações de cancelamento pendentes",
          description:
            "Lista as solicitações de cancelamento de reservas de alunos enviadas por professores e pendentes de decisão da coordenação.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Lista de solicitações pendentes.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/NotificacaoCancelamento" },
                  },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
      "/cancelamentos/{id}/cancelar": {
        post: {
          tags: ["Cancelamentos"],
          summary: "Cancelar reserva ou solicitar cancelamento (POST)",
          description:
            "Executa o mesmo fluxo central de cancelamento de `PATCH /reservas/:id/cancelar` através do módulo `/cancelamentos`.",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CancelarReservaInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Reserva cancelada com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResultadoCancelamento" },
                },
              },
            },
            "202": {
              description: "Solicitação de cancelamento enviada ao coordenador.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResultadoCancelamento" },
                },
              },
            },
            "400": {
              description: "ID ou justificativa inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Sem permissão (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Reserva não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Status incompatível (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "422": {
              description: "Reserva já iniciada (`REGRA_DE_NEGOCIO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
        patch: {
          tags: ["Cancelamentos"],
          summary: "Cancelar reserva ou solicitar cancelamento (PATCH)",
          description:
            "Executa o mesmo fluxo central de cancelamento de `PATCH /reservas/:id/cancelar` através do módulo `/cancelamentos`.",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CancelarReservaInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Reserva cancelada com sucesso.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResultadoCancelamento" },
                },
              },
            },
            "202": {
              description: "Solicitação de cancelamento enviada ao coordenador.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ResultadoCancelamento" },
                },
              },
            },
            "400": {
              description: "ID ou justificativa inválidos (`VALIDACAO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "401": {
              description: "Não autenticado (`NAO_AUTENTICADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "403": {
              description: "Sem permissão (`PERMISSAO_NEGADA`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "404": {
              description: "Reserva não encontrada (`NAO_ENCONTRADO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "409": {
              description: "Status incompatível (`CONFLITO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
            "422": {
              description: "Reserva já iniciada (`REGRA_DE_NEGOCIO`).",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErroPadrao" },
                },
              },
            },
          },
        },
      },
    },
  };
}

