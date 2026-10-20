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
      version: "1.2.0",
      description: [
        "API REST do sistema **ReservaIF** para gerenciamento de prédios, salas, laboratórios, solicitações de reserva, fluxo de aprovação por responsável/coordenação e cancelamentos no IFES.",
        "",
        "### Autenticação JWT (`Bearer`)",
        "1. Obtenha um token em `POST /autenticacao/login` informando `{ entrada, senha }` (ou opcionalmente `tipoEntrada`).",
        "2. Clique no botão **Authorize** no topo do Swagger UI e cole **apenas o valor do campo `token`** (sem o prefixo `Bearer `, pois o Swagger UI o adiciona automaticamente).",
        "3. Todas as rotas protegidas enviarão o cabeçalho `Authorization: Bearer <token>`.",
        "",
        "### Perfis de Acesso (`NivelAcesso`)",
        "- `1` — **ALUNO** (`MATRICULA_ALUNO`): cadastra-se com `matricula` (8 a 15 caracteres; `email` e `telefone` opcionais). Solicita reservas com indicação obrigatória de servidor/coordenador responsável (`responsavelId`), antecedência mínima de 12h e limite de 2 reservas a cada 12h e 2 por dia (`status = PENDENTE_APROVACAO` até aceite do responsável).",
        "- `2` — **TECNICO** (`SIAPE_TECNICO`): cadastra-se com `siape` (6 a 7 dígitos numéricos). Cria reservas para si mesmo com agendamento imediato (`status = AGENDADO`), respeitando antecedência mínima de 12h e limite de 2 reservas a cada 12h e 2 por dia, ou atua como responsável por reserva de aluno.",
        "- `3` — **PROFESSOR** (`SIAPE_DOCENTE`): cadastra-se com `siape` (6 a 7 dígitos numéricos). Cria reservas com agendamento imediato (`status = AGENDADO`), aceita reservas de alunos sob sua responsabilidade (`PATCH /reservas/:id/aceitar-responsabilidade` -> `status = APROVADA`) e pode solicitar à coordenação o cancelamento de reserva de aluno (`202 Accepted`).",
        "- `4` — **COORDENADOR** (`SIAPE_DOCENTE` com papel/lotação de coordenação): cadastra-se com `siape` (6 a 7 dígitos numéricos) e vínculo a prédio(s) coordenado(s). Gerencia prédios e salas dentro de seu escopo territorial, cria séries recorrentes (`SEMANAL`, `MENSAL`, `SEMESTRAL`, `ANUAL`) com `status = APROVADA`, e aprova/rejeita/cancela reservas do seu prédio desde que não estejam sob a responsabilidade de outro coordenador.",
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
        description: "Cadastro de alunos, professores, técnicos e coordenadores, consulta de perfil autenticado e catálogo de departamentos elegíveis.",
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
        description: "Solicitação de reservas únicas ou recorrentes, consulta de reservas solicitadas vs sob responsabilidade, aceite/aprovação, rejeição e cancelamento.",
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
          required: ["entrada", "senha"],
          properties: {
            entrada: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "Identificador de login: matrícula (8–15 caracteres do aluno) ou SIAPE (6–7 dígitos do servidor).",
              example: "20261001",
            },
            senha: {
              type: "string",
              format: "password",
              description: "Senha cadastrada (mínimo de 8 bytes UTF-8).",
              example: "SenhaSegura@123",
            },
            tipoEntrada: {
              type: "integer",
              enum: [0, 1, 2],
              description: "Tipo de credencial opcional: `0 = LOCAL` (padrão), `1 = CORPORATIVA`, `2 = OAUTH`.",
              example: 0,
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
              enum: [1, 2, 3, 4],
              description: "`1 = ALUNO`, `2 = TECNICO`, `3 = PROFESSOR`, `4 = COORDENADOR`.",
              example: 4,
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
          required: ["senha"],
          properties: {
            senha: {
              type: "string",
              minLength: 8,
              maxLength: 72,
              description: "Senha entre 8 e 72 bytes UTF-8.",
              example: "SenhaSegura@123",
            },
            entrada: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "Opcional quando `matricula` ou `siape` for informado no topo do payload.",
              example: "20261001",
            },
            tipoEntrada: {
              type: "integer",
              enum: [0, 1, 2],
              description: "`0 = LOCAL` (padrão), `1 = CORPORATIVA`, `2 = OAUTH`.",
              example: 0,
            },
          },
        },
        LotacaoCoordenacaoCadastroInput: {
          type: "object",
          required: ["predioId"],
          properties: {
            predioId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "ObjectId do prédio coordenado.",
              example: "64b7f0c2a1b2c3d4e5f60015",
            },
            numeroPortaria: {
              type: "string",
              description: "Portaria de designação da coordenação.",
              example: "PORTARIA-IFES-2026-01",
            },
          },
        },
        CadastroUsuarioInput: {
          type: "object",
          required: ["nome"],
          properties: {
            nome: {
              type: "string",
              example: "Ana Clara Souza",
            },
            role: {
              type: "string",
              enum: ["ALUNO", "PROFESSOR", "TECNICO", "COORDENADOR"],
              description: "Papel do usuário (`ALUNO`, `PROFESSOR`, `TECNICO` ou `COORDENADOR`).",
              example: "ALUNO",
            },
            matricula: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "Exclusivo para `ALUNO`: matrícula de 8 a 15 caracteres (rejeita SIAPE de 6–7 dígitos).",
              example: "20261001",
            },
            siape: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "Exclusivo para `PROFESSOR`, `TECNICO` e `COORDENADOR`: SIAPE numérico de 6 a 7 dígitos.",
              example: "1543210",
            },
            senha: {
              type: "string",
              minLength: 8,
              maxLength: 72,
              description: "Senha entre 8 e 72 bytes UTF-8 (recomendada; dispensa objeto credencial).",
              example: "SenhaSegura@123",
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              description: "E-mail institucional opcional.",
              example: "ana.souza@ifes.edu.br",
            },
            telefone: {
              type: "string",
              nullable: true,
              description: "Telefone de contato opcional.",
              example: "(27) 99999-0000",
            },
            departamentoId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              nullable: true,
              description: "Opcional para servidores (`PROFESSOR`, `TECNICO`, `COORDENADOR`).",
              example: "64b7f0c2a1b2c3d4e5f60002",
            },
            predioId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              nullable: true,
              description: "Opcional para `COORDENADOR`: vincula o prédio sob sua coordenação.",
              example: "64b7f0c2a1b2c3d4e5f60015",
            },
            numeroPortaria: {
              type: "string",
              nullable: true,
              description: "Portaria de designação opcional para `COORDENADOR`.",
              example: "PORTARIA-IFES-2026-01",
            },
            uuid: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "ObjectId opcional (gerado automaticamente quando omitido).",
              example: "64b7f0c2a1b2c3d4e5f60222",
            },
            credencial: {
              $ref: "#/components/schemas/CriarCredencialInput",
            },
            coordenacoes: {
              type: "array",
              items: { $ref: "#/components/schemas/LotacaoCoordenacaoCadastroInput" },
              description: "Opcional para `COORDENADOR`: lista de lotações com prédio e portaria.",
            },
          },
        },
        CadastroAlunoInput: {
          type: "object",
          required: ["nome", "matricula", "senha"],
          properties: {
            nome: {
              type: "string",
              example: "Ana Clara Souza",
            },
            matricula: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "Matrícula de 8 a 15 caracteres (rejeita SIAPE de 6 a 7 dígitos).",
              example: "20261001",
            },
            senha: {
              type: "string",
              minLength: 8,
              maxLength: 72,
              description: "Senha cadastrada (mínimo de 8 bytes UTF-8).",
              example: "SenhaSegura@123",
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              description: "E-mail institucional opcional.",
              example: "ana.souza@ifes.edu.br",
            },
            telefone: {
              type: "string",
              nullable: true,
              description: "Telefone de contato opcional.",
              example: "(27) 99999-0000",
            },
          },
        },
        CadastroServidorInput: {
          type: "object",
          required: ["nome", "siape", "senha"],
          properties: {
            nome: {
              type: "string",
              example: "Prof. Carlos Mendes",
            },
            role: {
              type: "string",
              enum: ["PROFESSOR", "TECNICO", "COORDENADOR"],
              description: "Papel do servidor (`PROFESSOR`, `TECNICO` ou `COORDENADOR`).",
              example: "PROFESSOR",
            },
            siape: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "SIAPE numérico de 6 a 7 dígitos (rejeita matrícula de aluno).",
              example: "1543210",
            },
            senha: {
              type: "string",
              minLength: 8,
              maxLength: 72,
              description: "Senha de acesso.",
              example: "SenhaSegura@123",
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              example: "carlos.mendes@ifes.edu.br",
            },
            telefone: {
              type: "string",
              nullable: true,
              example: "(27) 98888-1111",
            },
            departamentoId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              nullable: true,
              example: "64b7f0c2a1b2c3d4e5f60002",
            },
            predioId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              nullable: true,
              description: "Prédio coordenado (quando role = COORDENADOR).",
              example: "64b7f0c2a1b2c3d4e5f60015",
            },
            numeroPortaria: {
              type: "string",
              nullable: true,
              example: "PORTARIA-IFES-2026-01",
            },
          },
        },
        CadastroProfessorInput: {
          type: "object",
          required: ["nome", "siape", "senha"],
          properties: {
            nome: {
              type: "string",
              example: "Prof. Carlos Mendes",
            },
            siape: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "SIAPE numérico de 6 a 7 dígitos.",
              example: "1543210",
            },
            senha: {
              type: "string",
              minLength: 8,
              maxLength: 72,
              example: "SenhaSegura@123",
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              example: "carlos.mendes@ifes.edu.br",
            },
            telefone: {
              type: "string",
              nullable: true,
              example: "(27) 98888-1111",
            },
            departamentoId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              nullable: true,
              example: "64b7f0c2a1b2c3d4e5f60002",
            },
          },
        },
        CadastroTecnicoInput: {
          type: "object",
          required: ["nome", "siape", "senha"],
          properties: {
            nome: {
              type: "string",
              example: "João Silva",
            },
            siape: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "SIAPE numérico de 6 a 7 dígitos.",
              example: "1654321",
            },
            senha: {
              type: "string",
              minLength: 8,
              maxLength: 72,
              example: "SenhaSegura@123",
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              example: "joao.silva@ifes.edu.br",
            },
            telefone: {
              type: "string",
              nullable: true,
              example: "(27) 97777-2222",
            },
            departamentoId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              nullable: true,
              example: "64b7f0c2a1b2c3d4e5f60002",
            },
          },
        },
        CadastroCoordenadorInput: {
          type: "object",
          required: ["nome", "siape", "senha", "predioId"],
          properties: {
            nome: {
              type: "string",
              example: "Coord. Roberto Lima",
            },
            siape: {
              oneOf: [{ type: "string" }, { type: "integer" }],
              description: "SIAPE numérico de 6 a 7 dígitos.",
              example: "1765432",
            },
            senha: {
              type: "string",
              minLength: 8,
              maxLength: 72,
              example: "SenhaSegura@123",
            },
            predioId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "ObjectId do prédio coordenado.",
              example: "64b7f0c2a1b2c3d4e5f60015",
            },
            numeroPortaria: {
              type: "string",
              nullable: true,
              description: "Portaria de designação.",
              example: "PORTARIA-IFES-2026-01",
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              example: "roberto.lima@ifes.edu.br",
            },
            telefone: {
              type: "string",
              nullable: true,
              example: "(27) 98888-3333",
            },
            departamentoId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              nullable: true,
              example: "64b7f0c2a1b2c3d4e5f60002",
            },
          },
        },
        ServidorResumo: {
          type: "object",
          required: ["id", "nome", "siape", "role", "nivelAcesso", "tipoCredencial", "ativo"],
          properties: {
            id: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "ObjectId do servidor.",
              example: "64b7f0c2a1b2c3d4e5f60002",
            },
            uuid: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              description: "UUID/ID do servidor.",
              example: "64b7f0c2a1b2c3d4e5f60002",
            },
            nome: {
              type: "string",
              example: "Prof. Carlos Mendes",
            },
            email: {
              type: "string",
              format: "email",
              nullable: true,
              example: "carlos.mendes@ifes.edu.br",
            },
            telefone: {
              type: "string",
              nullable: true,
              example: "(27) 98888-1111",
            },
            siape: {
              type: "string",
              description: "Número SIAPE institucional do servidor.",
              example: "1543210",
            },
            identificador: {
              type: "string",
              example: "1543210",
            },
            role: {
              type: "string",
              enum: ["PROFESSOR", "TECNICO", "COORDENADOR"],
              example: "PROFESSOR",
            },
            nivelAcesso: {
              type: "integer",
              enum: [2, 3, 4],
              description: "2 = TECNICO, 3 = PROFESSOR, 4 = COORDENADOR.",
              example: 3,
            },
            tipoCredencial: {
              type: "string",
              enum: ["SIAPE_DOCENTE", "SIAPE_TECNICO"],
              example: "SIAPE_DOCENTE",
            },
            ativo: {
              type: "boolean",
              example: true,
            },
            departamento: {
              type: "object",
              nullable: true,
              description: "Departamento institucional de lotação.",
              properties: {
                id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60103" },
                nome: { type: "string", example: "Coordenadoria de Tecnologia da Informação" },
              },
            },
            coordenacoes: {
              type: "array",
              description: "Lotações de coordenação vigentes (quando aplicável).",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60555" },
                  predioId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60015" },
                  numeroPortaria: { type: "string", example: "PORTARIA-IFES-2026-01" },
                  ativo: { type: "boolean", example: true },
                  predio: { $ref: "#/components/schemas/PredioResumo" },
                },
              },
            },
            criadoEm: {
              type: "string",
              format: "date-time",
              example: "2026-10-20T10:00:00.000Z",
            },
          },
        },
        LotacaoCoordenacaoResposta: {
          type: "object",
          required: ["id", "predioId", "numeroPortaria", "ativo", "coordenador", "predio"],
          properties: {
            id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60555" },
            predioId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60015" },
            numeroPortaria: { type: "string", example: "PORTARIA-IFES-2026-01" },
            ativo: { type: "boolean", example: true },
            coordenador: {
              type: "object",
              required: ["id", "nome", "siape"],
              properties: {
                id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60333" },
                nome: { type: "string", example: "Coord. Roberto Lima" },
                siape: { type: "string", example: "1765432" },
                email: { type: "string", nullable: true, example: "roberto.lima@ifes.edu.br" },
              },
            },
            predio: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60015" },
                nome: { type: "string", example: "Prédio TI" },
                campusId: { type: "string", nullable: true },
              },
            },
          },
        },
        UsuarioCadastrado: {
          type: "object",
          required: ["uuid", "nivelAcesso", "role", "nome", "tipoCredencial", "identificador", "coordenacoes"],
          properties: {
            uuid: {
              type: "string",
              example: "64b7f0c2a1b2c3d4e5f60222",
            },
            nivelAcesso: {
              type: "integer",
              enum: [1, 2, 3, 4],
              example: 1,
            },
            role: {
              type: "string",
              enum: ["ALUNO", "TECNICO", "PROFESSOR", "COORDENADOR"],
              example: "ALUNO",
            },
            nome: {
              type: "string",
              example: "Ana Clara Souza",
            },
            email: {
              type: "string",
              nullable: true,
              example: "ana.souza@ifes.edu.br",
            },
            telefone: {
              type: "string",
              nullable: true,
              example: "(27) 99999-0000",
            },
            tipoCredencial: {
              type: "string",
              enum: ["MATRICULA_ALUNO", "SIAPE_DOCENTE", "SIAPE_TECNICO"],
              example: "MATRICULA_ALUNO",
            },
            identificador: {
              type: "string",
              example: "20261001",
            },
            aluno: {
              type: "object",
              nullable: true,
              properties: {
                matricula: { type: "string", example: "20261001" },
              },
            },
            servidor: {
              type: "object",
              nullable: true,
              properties: {
                siape: { type: "string", example: "1543210" },
                departamento: {
                  type: "object",
                  nullable: true,
                  properties: {
                    id: { type: "string" },
                    nome: { type: "string" },
                  },
                },
              },
            },
            coordenacoes: {
              type: "array",
              items: { $ref: "#/components/schemas/LotacaoCoordenacaoResposta" },
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
            email: { type: "string", format: "email", nullable: true, example: "carlos.mendes@ifes.edu.br" },
            telefone: { type: "string", nullable: true, example: "(27) 98888-1111" },
            nivelAcesso: { type: "integer", enum: [1, 2, 3, 4], example: 3 },
            role: {
              type: "string",
              enum: ["ALUNO", "TECNICO", "PROFESSOR", "COORDENADOR"],
              example: "PROFESSOR",
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
                matricula: { type: "string", example: "20261001" },
              },
            },
            servidor: {
              type: "object",
              nullable: true,
              properties: {
                siape: { type: "string", example: "1543210" },
                departamento: { type: "object", nullable: true, additionalProperties: true },
              },
            },
            coordenacoes: {
              type: "array",
              items: { $ref: "#/components/schemas/LotacaoCoordenacaoResposta" },
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
          required: ["id", "nome", "campusId", "endereco"],
          properties: {
            id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60015" },
            nome: { type: "string", example: "Prédio TI" },
            campusId: { type: "string", nullable: true, example: null },
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
            id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60111" },
            nome: { type: "string", example: "Laboratório de Informática 01" },
            nomeSala: { type: "string", example: "Laboratório de Informática 01" },
            capacidade: {
              type: "integer",
              nullable: true,
              description: "Capacidade máxima da sala ou `null` quando não especificada.",
              example: 30,
            },
            predioId: { type: "string", example: "64b7f0c2a1b2c3d4e5f60015" },
            ativa: { type: "boolean", example: true },
            codigo: { type: "string", nullable: true, example: null },
            numSala: { type: "integer", nullable: true, example: null },
            andar: { type: "integer", nullable: true, example: 1 },
            tipo: {
              type: "string",
              enum: ["SALA_AULA", "LABORATORIO", "AUDITORIO", "REUNIAO"],
              nullable: true,
              example: "LABORATORIO",
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
            nome: { type: "string", example: "Prédio de Pesquisa e Extensão" },
            campusId: { type: "string", nullable: true, example: null },
            endereco: {
              allOf: [{ $ref: "#/components/schemas/Endereco" }],
              nullable: true,
            },
          },
          example: {
            nome: "Prédio de Pesquisa e Extensão",
            endereco: {
              rua: "Rodovia ES-080, Km 93",
              numero: 100,
              bairro: "São João de Petrópolis",
              cep: "29660-000",
            },
          },
        },
        AtualizarPredioInput: {
          type: "object",
          description: "Informe ao menos um campo para atualizar.",
          properties: {
            nome: { type: "string", example: "Prédio de Pesquisa e Extensão (Reformado)" },
            campusId: { type: "string", nullable: true },
            endereco: {
              allOf: [{ $ref: "#/components/schemas/Endereco" }],
              nullable: true,
            },
          },
          example: {
            nome: "Prédio de Pesquisa e Extensão (Reformado)",
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
                  required: ["id", "nome", "campusId"],
                  properties: {
                    id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60015" },
                    nome: { type: "string", example: "Prédio TI" },
                    campusId: { type: "string", nullable: true, example: null },
                  },
                },
              },
            },
          ],
        },
        CriarSalaInput: {
          type: "object",
          required: ["predioId", "nomeSala"],
          description: "Informe `predioId` e `nomeSala`. `capacidade` aceita inteiro >= 1 ou `null`.",
          properties: {
            predioId: {
              type: "string",
              pattern: "^[a-fA-F0-9]{24}$",
              example: "64b7f0c2a1b2c3d4e5f60015",
            },
            nomeSala: {
              type: "string",
              description: "Nome único da sala dentro do prédio informado.",
              example: "Laboratório de Redes e Sistemas",
            },
            capacidade: {
              type: "integer",
              minimum: 1,
              nullable: true,
              description: "Inteiro positivo (`>= 1`) ou `null` quando não especificada.",
              example: 30,
            },
            tipo: {
              type: "string",
              enum: ["SALA_AULA", "LABORATORIO", "AUDITORIO", "REUNIAO"],
              nullable: true,
              example: "LABORATORIO",
            },
            andar: { type: "integer", nullable: true, example: 1 },
            codigo: { type: "string", nullable: true, example: null },
            numSala: { type: "integer", minimum: 0, nullable: true, example: null },
            ativa: { type: "boolean", example: true },
          },
          example: {
            predioId: "64b7f0c2a1b2c3d4e5f60015",
            nomeSala: "Laboratório de Redes e Sistemas",
            capacidade: 30,
            andar: 1,
            tipo: "LABORATORIO",
            ativa: true,
          },
        },
        AtualizarSalaInput: {
          type: "object",
          description: "Informe ao menos um campo para atualizar a sala.",
          properties: {
            nomeSala: { type: "string", example: "Laboratório de Redes Avançadas" },
            capacidade: { type: "integer", minimum: 1, nullable: true, example: 35 },
            tipo: {
              type: "string",
              enum: ["SALA_AULA", "LABORATORIO", "AUDITORIO", "REUNIAO"],
              nullable: true,
            },
            andar: { type: "integer", nullable: true },
            ativa: { type: "boolean", example: true },
            predioId: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
          },
          example: {
            nomeSala: "Laboratório de Redes Avançadas",
            capacidade: 35,
            ativa: true,
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
        UsuarioAssociadoReserva: {
          type: "object",
          required: ["id", "nome", "tipoCredencial"],
          properties: {
            id: { type: "string", example: "64b7f0c2a1b2c3d4e5f60222" },
            nome: { type: "string", example: "Ana Clara Souza" },
            emailInstitucional: { type: "string", nullable: true, example: "ana.souza@ifes.edu.br" },
            telefone: { type: "string", nullable: true, example: "(27) 99999-0000" },
            codigoLogin: { type: "string", example: "20261001" },
            tipoCredencial: {
              type: "string",
              enum: ["MATRICULA_ALUNO", "SIAPE_DOCENTE", "SIAPE_TECNICO"],
            },
            nivelAcesso: { type: "integer", enum: [1, 2, 3, 4], example: 1 },
            departamento: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string" },
                nome: { type: "string" },
              },
            },
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
              example: "AGENDADO",
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
            sala: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string" },
                predioId: { type: "string" },
                codigo: { type: "string", nullable: true },
                numSala: { type: "integer", nullable: true },
                nomeSala: { type: "string" },
                andar: { type: "integer", nullable: true },
                capacidade: { type: "integer", nullable: true },
                tipo: { type: "string", nullable: true },
                ativa: { type: "boolean" },
                predio: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    nome: { type: "string" },
                    campusId: { type: "string", nullable: true },
                    endereco: { $ref: "#/components/schemas/Endereco" },
                  },
                },
                recursos: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      descricao: { type: "string" },
                    },
                  },
                },
              },
            },
            solicitante: {
              allOf: [{ $ref: "#/components/schemas/UsuarioAssociadoReserva" }],
              nullable: true,
            },
            responsavel: {
              allOf: [{ $ref: "#/components/schemas/UsuarioAssociadoReserva" }],
              nullable: true,
            },
            analisadoPor: {
              allOf: [{ $ref: "#/components/schemas/UsuarioAssociadoReserva" }],
              nullable: true,
            },
            serieRecorrencia: {
              type: "object",
              nullable: true,
              additionalProperties: true,
            },
          },
        },
        SerieRecorrencia: {
          type: "object",
          required: [
            "id",
            "salaId",
            "criadoPorId",
            "tipoRecorrencia",
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
            tipoRecorrencia: {
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
            "Exclusivo para Coordenador em seu prédio coordenado. Em `SEMANAL`, `dataFim` e `diasSemana` são obrigatórios. Em `MENSAL`, `SEMESTRAL` e `ANUAL`, o horizonte e o dia da semana são calculados automaticamente quando omitidos.",
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
                "Obrigatório para `ALUNO` (deve ser um Servidor ou Coordenador ativo). Opcional para `COORDENADOR`. Não permitido delegar para outro usuário quando solicitante é `PROFESSOR` ou `TECNICO`.",
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
              example: "Sala interditada para manutenção preventiva na rede elétrica.",
            },
          },
          example: {
            motivo: "Sala interditada para manutenção preventiva na rede elétrica.",
          },
        },
        CancelarReservaInput: {
          type: "object",
          required: ["justificativa"],
          properties: {
            justificativa: {
              type: "string",
              example: "Cancelamento solicitado devido a alteração imprevista no calendário acadêmico.",
            },
          },
          example: {
            justificativa: "Cancelamento solicitado devido a alteração imprevista no calendário acadêmico.",
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
            "Valida a credencial (`entrada` e `senha`) de um usuário ativo e retorna `{ uuid, nivelAcesso, token }`. `tipoEntrada` é opcional (`0 = LOCAL` por padrão).",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AutenticarCredencialInput" },
                examples: {
                  loginAluno: {
                    summary: "Login de Aluno (por Matrícula)",
                    value: {
                      entrada: "20261001",
                      senha: "SenhaSegura@123",
                    },
                  },
                  loginProfessor: {
                    summary: "Login de Professor (por SIAPE)",
                    value: {
                      entrada: "1543210",
                      senha: "SenhaSegura@123",
                    },
                  },
                  loginTecnico: {
                    summary: "Login de Técnico (por SIAPE)",
                    value: {
                      entrada: "1654321",
                      senha: "SenhaSegura@123",
                    },
                  },
                  loginCoordenador: {
                    summary: "Login de Coordenador (por SIAPE)",
                    value: {
                      entrada: "1765432",
                      senha: "SenhaSegura@123",
                    },
                  },
                },
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
                examples: {
                  loginAluno: {
                    summary: "Login de Aluno",
                    value: { entrada: "20261001", senha: "SenhaSegura@123" },
                  },
                  loginServidor: {
                    summary: "Login de Servidor",
                    value: { entrada: "1543210", senha: "SenhaSegura@123" },
                  },
                },
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
          summary: "Cadastrar usuário (ALUNO, PROFESSOR, TECNICO ou COORDENADOR)",
          description: [
            "Cadastra um novo usuário no sistema (o backend valida o perfil/tipoCredencial e define o nivelAcesso e role correspondentes de forma segura):",
            "- **ALUNO:** informa `nome`, `role: 'ALUNO'`, `matricula` e `senha`. (`email` e `telefone` opcionais).",
            "- **PROFESSOR / TECNICO:** informa `nome`, `role`, `siape` e `senha`. (`departamentoId`, `email` e `telefone` opcionais).",
            "- **COORDENADOR:** informa `nome`, `role: 'COORDENADOR'`, `siape`, `senha` e `predioId`. (`numeroPortaria` opcional).",
          ].join("\n"),
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroUsuarioInput" },
                examples: {
                  cadastroAluno: {
                    summary: "Cadastro de Aluno (Mínimo recomendado)",
                    value: {
                      nome: "Ana Clara Souza",
                      role: "ALUNO",
                      matricula: "20261001",
                      senha: "SenhaSegura@123",
                      email: "ana.souza@ifes.edu.br",
                      telefone: "(27) 99999-0000",
                    },
                  },
                  cadastroProfessor: {
                    summary: "Cadastro de Professor",
                    value: {
                      nome: "Prof. Carlos Mendes",
                      role: "PROFESSOR",
                      siape: "1543210",
                      senha: "SenhaSegura@123",
                      email: "carlos.mendes@ifes.edu.br",
                    },
                  },
                  cadastroTecnico: {
                    summary: "Cadastro de Técnico Administrativo",
                    value: {
                      nome: "João Silva",
                      role: "TECNICO",
                      siape: "1654321",
                      senha: "SenhaSegura@123",
                      email: "joao.silva@ifes.edu.br",
                    },
                  },
                  cadastroCoordenador: {
                    summary: "Cadastro de Coordenador com Prédio",
                    value: {
                      nome: "Coord. Roberto Lima",
                      role: "COORDENADOR",
                      siape: "1765432",
                      senha: "SenhaSegura@123",
                      predioId: "64b7f0c2a1b2c3d4e5f60015",
                      numeroPortaria: "PORTARIA-IFES-2026-01",
                    },
                  },
                },
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
              description: "Dados de cadastro inválidos ou conflito entre papel e identificador (`VALIDACAO`).",
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
          summary: "Cadastrar aluno (ALUNO)",
          description:
            "Rota dedicada para cadastro de `ALUNO` (`MATRICULA_ALUNO`, `nivelAcesso = 1`). Exige `nome`, `matricula` e `senha`. Rejeita SIAPE. `email` e `telefone` são opcionais.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroAlunoInput" },
                examples: {
                  alunoMinimo: {
                    summary: "Cadastro Mínimo de Aluno (Recomendado)",
                    value: {
                      nome: "Ana Clara Souza",
                      matricula: "20261001",
                      senha: "SenhaSegura@123",
                    },
                  },
                  alunoCompleto: {
                    summary: "Cadastro de Aluno com Contato",
                    value: {
                      nome: "Ana Clara Souza",
                      matricula: "20261001",
                      senha: "SenhaSegura@123",
                      email: "ana.souza@ifes.edu.br",
                      telefone: "(27) 99999-0000",
                    },
                  },
                },
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
              description: "Dados inválidos ou tentativa de usar SIAPE (`VALIDACAO`).",
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
        get: {
          tags: ["Usuários"],
          summary: "Listar servidores (professores, técnicos e coordenadores)",
          description:
            "Retorna todos os servidores públicos ativos cadastrados no sistema (PROFESSOR, TECNICO e COORDENADOR), com seus dados funcionais (SIAPE, departamento, cargo/role e coordenações). Permite filtrar por papel (`?role=PROFESSOR`), `departamentoId` ou `predioId`. Ideal para seleção de responsável em reservas de alunos.",
          security: [],
          parameters: [
            {
              name: "role",
              in: "query",
              required: false,
              description: "Filtrar por papel do servidor (`PROFESSOR`, `TECNICO` ou `COORDENADOR`).",
              schema: {
                type: "string",
                enum: ["PROFESSOR", "TECNICO", "COORDENADOR"],
              },
            },
            {
              name: "departamentoId",
              in: "query",
              required: false,
              description: "Filtrar por ObjectId do departamento.",
              schema: {
                type: "string",
                pattern: "^[a-fA-F0-9]{24}$",
              },
            },
            {
              name: "predioId",
              in: "query",
              required: false,
              description: "Filtrar coordenadores por ObjectId do prédio coordenado.",
              schema: {
                type: "string",
                pattern: "^[a-fA-F0-9]{24}$",
              },
            },
          ],
          responses: {
            "200": {
              description: "Lista de servidores cadastrados.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/ServidorResumo" },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Usuários"],
          summary: "Cadastrar servidor (PROFESSOR, TECNICO ou COORDENADOR)",
          description:
            "Rota para cadastro de servidores (`PROFESSOR`, `TECNICO` ou `COORDENADOR`) utilizando `siape` (6 a 7 dígitos), `senha` e `departamentoId` obrigatório. Rejeita matrícula de aluno.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroServidorInput" },
                examples: {
                  professor: {
                    summary: "Cadastro de Professor",
                    value: {
                      nome: "Prof. Carlos Mendes",
                      role: "PROFESSOR",
                      siape: "1543210",
                      senha: "SenhaSegura@123",
                      email: "carlos.mendes@ifes.edu.br",
                    },
                  },
                  tecnico: {
                    summary: "Cadastro de Técnico",
                    value: {
                      nome: "João Silva",
                      role: "TECNICO",
                      siape: "1654321",
                      senha: "SenhaSegura@123",
                      email: "joao.silva@ifes.edu.br",
                    },
                  },
                  coordenador: {
                    summary: "Cadastro de Coordenador",
                    value: {
                      nome: "Coord. Roberto Lima",
                      role: "COORDENADOR",
                      siape: "1765432",
                      senha: "SenhaSegura@123",
                      predioId: "64b7f0c2a1b2c3d4e5f60015",
                      numeroPortaria: "PORTARIA-IFES-2026-01",
                    },
                  },
                },
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
      "/usuarios/professores": {
        get: {
          tags: ["Usuários"],
          summary: "Listar professores",
          description: "Retorna a lista de servidores com perfil de PROFESSOR e seus respectivos departamentos.",
          security: [],
          parameters: [
            {
              name: "departamentoId",
              in: "query",
              required: false,
              description: "Filtrar por ObjectId do departamento.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de professores cadastrados.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/ServidorResumo" },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Usuários"],
          summary: "Cadastrar professor (PROFESSOR)",
          description:
            "Rota dedicada para cadastro de `PROFESSOR` (`SIAPE_DOCENTE`, `nivelAcesso = 3`). Exige `nome`, `siape` (6 a 7 dígitos), `senha` e `departamentoId` institucional obrigatório. Rejeita matrícula de aluno.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroProfessorInput" },
                example: {
                  nome: "Prof. Carlos Mendes",
                  siape: "1543210",
                  senha: "SenhaSegura@123",
                  email: "carlos.mendes@ifes.edu.br",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Professor cadastrado com sucesso.",
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
      "/usuarios/tecnicos": {
        get: {
          tags: ["Usuários"],
          summary: "Listar técnicos administrativos",
          description: "Retorna a lista de servidores com perfil de TECNICO e seus respectivos departamentos.",
          security: [],
          parameters: [
            {
              name: "departamentoId",
              in: "query",
              required: false,
              description: "Filtrar por ObjectId do departamento.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de técnicos administrativos cadastrados.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/ServidorResumo" },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Usuários"],
          summary: "Cadastrar técnico administrativo (TECNICO)",
          description:
            "Rota dedicada para cadastro de `TECNICO` (`SIAPE_TECNICO`, `nivelAcesso = 2`). Exige `nome`, `siape` (6 a 7 dígitos), `senha` e `departamentoId` institucional obrigatório. Rejeita matrícula de aluno.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroTecnicoInput" },
                example: {
                  nome: "João Silva",
                  siape: "1654321",
                  senha: "SenhaSegura@123",
                  email: "joao.silva@ifes.edu.br",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Técnico cadastrado com sucesso.",
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
      "/usuarios/coordenadores": {
        get: {
          tags: ["Usuários"],
          summary: "Listar coordenadores de prédio",
          description: "Retorna a lista de servidores com perfil de COORDENADOR e seus prédios coordenados vinculados.",
          security: [],
          parameters: [
            {
              name: "predioId",
              in: "query",
              required: false,
              description: "Filtrar por ObjectId do prédio coordenado.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de coordenadores de prédio cadastrados.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/ServidorResumo" },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Usuários"],
          summary: "Cadastrar coordenador (COORDENADOR)",
          description:
            "Rota dedicada para cadastro de `COORDENADOR` (`SIAPE_DOCENTE`, `nivelAcesso = 4`). Exige `nome`, `siape`, `senha`, `predioId` e `departamentoId` institucional obrigatório.",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CadastroCoordenadorInput" },
                example: {
                  nome: "Coord. Roberto Lima",
                  siape: "1765432",
                  senha: "SenhaSegura@123",
                  predioId: "64b7f0c2a1b2c3d4e5f60015",
                  numeroPortaria: "PORTARIA-IFES-2026-01",
                  email: "roberto.lima@ifes.edu.br",
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Coordenador cadastrado com sucesso.",
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
      "/usuarios/me": {
        get: {
          tags: ["Usuários"],
          summary: "Consultar perfil do usuário autenticado",
          description:
            "Retorna os dados do usuário correspondente ao token JWT, incluindo `nivelAcesso`, `role`, dados de aluno/servidor e lotações ativas.",
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
              schema: { type: "string", example: "TI" },
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
          description: "Cadastra um novo prédio. Requer usuário autenticado com perfil `COORDENADOR` (`nivelAcesso = 4`).",
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
          summary: "Atualizar prédio (Coordenador do prédio)",
          description:
            "Atualiza parcialmente os dados de um prédio existente. Coordenadores vinculados a prédio(s) específico(s) só podem alterar seus próprios prédios.",
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
              description: "Sem permissão ou prédio fora do escopo do coordenador (`PERMISSAO_NEGADA`).",
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
          summary: "Remover prédio (Coordenador do prédio)",
          description:
            "Remove um prédio sob escopo do coordenador que não possua salas associadas. Caso possua salas vinculadas, retorna `422 REGRA_DE_NEGOCIO`.",
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
              description: "Sem permissão ou prédio fora do escopo do coordenador (`PERMISSAO_NEGADA`).",
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
              schema: { type: "integer", minimum: 1, example: 20 },
            },
            {
              name: "capacidadeMax",
              in: "query",
              required: false,
              description: "Capacidade máxima (`>= 1`). Exclui salas com `capacidade: null`.",
              schema: { type: "integer", minimum: 1, example: 50 },
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
                example: "LABORATORIO",
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
            "Busca salas em todo o catálogo aplicando filtros diretamente no MongoDB. Sempre inclui o objeto `predio` para desambiguar salas de mesmo nome em prédios distintos.",
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
              schema: { type: "string", example: "TI" },
            },
            {
              name: "nome",
              in: "query",
              required: false,
              description: "Busca parcial case-insensitive pelo nome da sala.",
              schema: { type: "string", example: "Lab. de Física" },
            },
            {
              name: "capacidadeMin",
              in: "query",
              required: false,
              description: "Capacidade mínima (`>= 1`). Exclui salas com `capacidade: null`.",
              schema: { type: "integer", minimum: 1, example: 20 },
            },
            {
              name: "capacidadeMax",
              in: "query",
              required: false,
              description: "Capacidade máxima (`>= 1`, `>= capacidadeMin`). Exclui salas com `capacidade: null`.",
              schema: { type: "integer", minimum: 1, example: 40 },
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
                example: "LABORATORIO",
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
          summary: "Criar sala (Coordenador do prédio)",
          description:
            "Cadastra uma nova sala associada a um prédio existente dentro do escopo de coordenação do usuário. O nome da sala é único por prédio (`@@unique([predioId, nomeSala])`).",
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
              description: "Apenas coordenadores vinculados ao prédio podem criar salas (`PERMISSAO_NEGADA`).",
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
          summary: "Atualizar sala (Coordenador do prédio)",
          description: "Atualiza parcialmente os dados de uma sala (nome, capacidade, prédio, status `ativa`, etc.) dentro do prédio coordenado.",
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
              description: "Sem permissão ou prédio fora do escopo do coordenador (`PERMISSAO_NEGADA`).",
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
          summary: "Remover sala (Coordenador do prédio)",
          description:
            "Remove uma sala que não possua histórico de reservas. Se houver reservas vinculadas, retorna `422 REGRA_DE_NEGOCIO` orientando a inativação (`PATCH /salas/:id` com `{ 'ativa': false }`).",
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
              description: "Sem permissão ou prédio fora do escopo do coordenador (`PERMISSAO_NEGADA`).",
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
          summary: "Listar reservas com objetos associados",
          description:
            "Lista as reservas ordenadas por `dataHoraInicio` crescente, enriquecidas com `diaDaSemana` e com os objetos associados `sala` (incluindo `predio`), `solicitante`, `responsavel`, `analisadoPor` e `serieRecorrencia`.",
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
              description: "Filtra pelo ObjectId do servidor/coordenador responsável.",
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["PENDENTE_APROVACAO", "APROVADA", "AGENDADO", "REJEITADA", "CANCELADA", "CONCLUIDA"],
                example: "AGENDADO",
              },
            },
            {
              name: "data",
              in: "query",
              required: false,
              description: "Filtra reservas com início na data civil informada (`AAAA-MM-DD`).",
              schema: { type: "string", format: "date", example: "2026-11-10" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de reservas detalhadas.",
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
            "- **Professor (`PROFESSOR`):** nasce `AGENDADO` imediatamente, sem necessidade de aprovação de outra pessoa, validando ausência de conflito na sala.",
            "- **Técnico (`TECNICO`):** nasce `AGENDADO` imediatamente, sem necessidade de aprovação de outra pessoa, respeitando 12h de antecedência e limite de 2 reservas/12h e 2/dia.",
            "- **Coordenador (`COORDENADOR`, no prédio coordenado):** nasce `APROVADA` imediatamente, podendo criar série recorrente (`recorrencia`).",
            "- **Aluno (`ALUNO`):** nasce `PENDENTE_APROVACAO`, exige informar `responsavelId` (Servidor ou Coordenador ativo), 12h de antecedência e limite de 2 reservas/12h e 2/dia.",
          ].join("\n"),
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CriarReservaInput" },
                examples: {
                  reservaProfessor: {
                    summary: "Reserva Imediata de Professor (AGENDADO)",
                    value: {
                      salaId: "64b7f0c2a1b2c3d4e5f60111",
                      dataHoraInicio: "2026-11-10T10:00:00-03:00",
                      dataHoraFim: "2026-11-10T10:50:00-03:00",
                      finalidade: "Aula prática de Banco de Dados",
                      observacoes: "Necessário uso de projetor",
                    },
                  },
                  reservaTecnico: {
                    summary: "Reserva Imediata de Técnico (AGENDADO)",
                    value: {
                      salaId: "64b7f0c2a1b2c3d4e5f60111",
                      dataHoraInicio: "2026-11-10T14:00:00-03:00",
                      dataHoraFim: "2026-11-10T14:50:00-03:00",
                      finalidade: "Manutenção preventiva dos equipamentos",
                    },
                  },
                  reservaAluno: {
                    summary: "Solicitação de Aluno com Responsável (PENDENTE_APROVACAO)",
                    value: {
                      salaId: "64b7f0c2a1b2c3d4e5f60111",
                      dataHoraInicio: "2026-11-11T15:00:00-03:00",
                      dataHoraFim: "2026-11-11T15:50:00-03:00",
                      finalidade: "Grupo de estudos de Engenharia de Software",
                      responsavelId: "64b7f0c2a1b2c3d4e5f60333",
                    },
                  },
                  reservaCoordenadorRecorrente: {
                    summary: "Série Semestral de Coordenador (APROVADA)",
                    value: {
                      salaId: "64b7f0c2a1b2c3d4e5f60111",
                      dataHoraInicio: "2026-11-12T08:00:00-03:00",
                      dataHoraFim: "2026-11-12T08:50:00-03:00",
                      finalidade: "Aulas da disciplina de Sistemas Distribuídos",
                      recorrencia: {
                        tipo: "SEMESTRAL",
                      },
                    },
                  },
                },
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
      "/reservas/minhas": {
        get: {
          tags: ["Reservas"],
          summary: "Listar reservas criadas/solicitadas pelo usuário autenticado (solicitante)",
          description:
            "Retorna exclusivamente as reservas em que `solicitanteId` corresponde ao usuário autenticado no token JWT (`sub`). Permite filtros adicionais por `salaId`, `predioId`, `status` e `data`.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "salaId",
              in: "query",
              required: false,
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
            {
              name: "predioId",
              in: "query",
              required: false,
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
              schema: { type: "string", format: "date", example: "2026-11-10" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de reservas solicitadas pelo usuário autenticado.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Reserva" },
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
      "/reservas/solicitadas": {
        get: {
          tags: ["Reservas"],
          summary: "Listar reservas solicitadas pelo usuário autenticado (alias de /reservas/minhas)",
          description:
            "Alias para `GET /reservas/minhas`: retorna as reservas em que `solicitanteId` é o usuário autenticado.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Lista de reservas solicitadas pelo usuário autenticado.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Reserva" },
                  },
                },
              },
            },
          },
        },
      },
      "/reservas/responsavel": {
        get: {
          tags: ["Reservas"],
          summary: "Listar reservas sob responsabilidade do usuário autenticado (responsavel)",
          description:
            "Retorna exclusivamente as reservas em que `responsavelId` corresponde ao usuário autenticado no token JWT (`sub`), permitindo ao professor, técnico ou coordenador visualizar reservas de alunos vinculadas à sua responsabilidade.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "salaId",
              in: "query",
              required: false,
              schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
            },
            {
              name: "predioId",
              in: "query",
              required: false,
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
              schema: { type: "string", format: "date", example: "2026-11-10" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de reservas sob responsabilidade do usuário autenticado.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Reserva" },
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
      "/reservas/sob-minha-responsabilidade": {
        get: {
          tags: ["Reservas"],
          summary: "Listar reservas sob minha responsabilidade (alias de /reservas/responsavel)",
          description:
            "Alias para `GET /reservas/responsavel`: retorna as reservas em que `responsavelId` é o usuário autenticado.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Lista de reservas sob responsabilidade do usuário autenticado.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Reserva" },
                  },
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
          description: "Retorna os detalhes de uma reserva específica pelo seu `ObjectId`, enriquecida com `diaDaSemana` e objetos concretos.",
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
          summary: "Aceitar responsabilidade e aprovar reserva de aluno (Servidor/Coordenador responsável)",
          description:
            "O servidor (`PROFESSOR`, `TECNICO` ou `COORDENADOR`) designado em `responsavelId` aceita a responsabilidade pela reserva de aluno, valida ausência de conflito de agenda na sala e transiciona a reserva para `APROVADA`.",
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          responses: {
            "200": {
              description: "Responsabilidade aceita e reserva aprovada (`status = APROVADA`).",
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
              description: "Reserva não está pendente, já foi aceita ou há conflito de horário na sala (`CONFLITO`).",
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
          summary: "Aprovar reserva pendente (Responsável designado ou Coordenador do prédio)",
          description: [
            "Processa a aprovação de uma reserva com status `PENDENTE_APROVACAO`:",
            "- Se acionado pelo **Servidor/Coordenador designado como responsável (`responsavelId`)**: registra o aceite e aprova a reserva (`status = APROVADA`).",
            "- Se acionado pelo **Coordenador do prédio da sala**: aprova a reserva (`status = APROVADA`), respeitando a proibição de intervir em reservas sob a responsabilidade de outro coordenador.",
          ].join("\n"),
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: "#/components/parameters/ObjectIdPathParam" }],
          responses: {
            "200": {
              description: "Reserva aprovada (`status = APROVADA`).",
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
              description: "Usuário não é o responsável designado, não coordena o prédio ou a reserva pertence a outro coordenador (`PERMISSAO_NEGADA`).",
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
          summary: "Rejeitar reserva pendente (Responsável designado ou Coordenador do prédio)",
          description:
            "Rejeita uma reserva com status `PENDENTE_APROVACAO` (pelo responsável designado ou pelo coordenador do prédio, desde que não esteja sob a responsabilidade de outro coordenador), transicionando para `REJEITADA` e persistindo `motivoRejeicao`.",
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
              description: "Reserva rejeitada com sucesso (`status = REJEITADA`).",
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
              description: "Sem permissão ou reserva sob responsabilidade de outro coordenador (`PERMISSAO_NEGADA`).",
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
            "- **Coordenador:** cancela reservas do seu prédio coordenado (`200 OK`), exceto reservas sob responsabilidade de outro coordenador (`403 PERMISSAO_NEGADA`).",
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
