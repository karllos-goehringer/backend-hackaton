import { TipoCredencial } from "@prisma/client";

export interface DepartamentoElegivel {
  id: string;
  nome: string;
  diretoria: string;
  sigla?: string;
}

export const DEPARTAMENTOS_ELEGIVEIS: readonly DepartamentoElegivel[] = [
  { id: "gabinete-diretoria-geral", nome: "Gabinete da Diretoria Geral", sigla: "GABDG", diretoria: "Diretoria Geral" },
  {
    id: "comunicacao-social-eventos",
    nome: "Coordenadoria de Comunicação Social e Eventos",
    sigla: "CCSE",
    diretoria: "Diretoria Geral",
  },
  {
    id: "tecnologia-informacao",
    nome: "Coordenadoria de Tecnologia da Informação",
    sigla: "CTI",
    diretoria: "Diretoria Geral",
  },
  { id: "ensino-geral", nome: "Coordenadoria Geral de Ensino", diretoria: "Diretoria de Ensino" },
  {
    id: "curso-agronomia",
    nome: "Coordenadoria do Curso Superior de Agronomia",
    diretoria: "Diretoria de Ensino",
  },
  {
    id: "curso-medicina-veterinaria",
    nome: "Coordenadoria do Curso Superior de Medicina Veterinária",
    diretoria: "Diretoria de Ensino",
  },
  {
    id: "curso-ciencias-biologicas",
    nome: "Coordenadoria do Curso Superior de Licenciatura em Ciências Biológicas",
    diretoria: "Diretoria de Ensino",
  },
  {
    id: "curso-sistemas-internet",
    nome: "Coordenadoria do Curso Superior de Tecnologia em Sistemas para Internet",
    diretoria: "Diretoria de Ensino",
  },
  {
    id: "curso-tecnico-meio-ambiente",
    nome: "Coordenadoria do Curso Técnico em Meio Ambiente Integrado ao Ensino Médio",
    diretoria: "Diretoria de Ensino",
  },
  {
    id: "curso-tecnico-agropecuaria",
    nome: "Coordenadoria do Curso Técnico em Agropecuária Integrado ao Ensino Médio",
    diretoria: "Diretoria de Ensino",
  },
  {
    id: "curso-tecnico-informatica-internet",
    nome: "Coordenadoria do Curso Técnico em Informática para Internet Integrado ao Ensino Médio",
    diretoria: "Diretoria de Ensino",
  },
  { id: "gestao-pedagogica", nome: "Coordenadoria de Gestão Pedagógica", diretoria: "Diretoria de Ensino" },
  {
    id: "assistencia-comunidade-geral",
    nome: "Coordenadoria Geral de Assistência à Comunidade",
    diretoria: "Assistência à Comunidade",
  },
  {
    id: "alimentacao-nutricao",
    nome: "Coordenadoria de Alimentação e Nutrição",
    diretoria: "Assistência à Comunidade",
  },
  { id: "ambulatorial", nome: "Coordenadoria Ambulatorial", diretoria: "Assistência à Comunidade" },
  { id: "apoio-ensino", nome: "Coordenadoria de Apoio ao Ensino", diretoria: "Assistência à Comunidade" },
  {
    id: "atendimento-multidisciplinar",
    nome: "Coordenadoria de Atendimento Multidisciplinar",
    diretoria: "Assistência à Comunidade",
  },
  { id: "biblioteca", nome: "Coordenadoria de Biblioteca", diretoria: "Assistência à Comunidade" },
  { id: "internato", nome: "Coordenadoria de Internato", diretoria: "Assistência à Comunidade" },
  { id: "recursos-didaticos", nome: "Coordenadoria de Recursos Didáticos", diretoria: "Assistência à Comunidade" },
  {
    id: "administracao-orcamento-financas",
    nome: "Coordenadoria Geral de Administração, Orçamento e Finanças",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "contabilidade",
    nome: "Coordenadoria de Contabilidade",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "engenharia-manutencao",
    nome: "Coordenadoria de Engenharia e Manutenção",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "execucao-orcamentaria-financeira",
    nome: "Coordenadoria de Execução Orçamentária e Financeira",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "gestao-contratos",
    nome: "Coordenadoria de Gestão de Contratos",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "patrimonio-materiais-suprimentos",
    nome: "Coordenadoria de Patrimônio, Materiais e Suprimentos",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "servicos-auxiliares-transportes",
    nome: "Coordenadoria de Serviços Auxiliares e Transportes",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "gestao-campo",
    nome: "Coordenadoria Geral de Gestão do Campo",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "agricultura",
    nome: "Coordenadoria de Agricultura",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "agroindustria",
    nome: "Coordenadoria de Agroindústria",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "mecanizacao-rural",
    nome: "Coordenadoria de Mecanização Rural",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "zootecnia",
    nome: "Coordenadoria de Zootecnia",
    diretoria: "Diretoria de Administração e Planejamento",
  },
  {
    id: "cursos-programas-pos-graduacao",
    nome: "Coordenadoria de Cursos e Programas de Pós-Graduação",
    diretoria: "Diretoria de Pesquisa, Pós-Graduação e Extensão",
  },
  {
    id: "laboratorios",
    nome: "Coordenadoria de Laboratórios",
    diretoria: "Diretoria de Pesquisa, Pós-Graduação e Extensão",
  },
  {
    id: "pesquisa",
    nome: "Coordenadoria de Pesquisa",
    diretoria: "Diretoria de Pesquisa, Pós-Graduação e Extensão",
  },
  {
    id: "arte-cultura",
    nome: "Núcleo de Arte e Cultura",
    diretoria: "Diretoria de Pesquisa, Pós-Graduação e Extensão",
  },
  {
    id: "extensao-geral",
    nome: "Coordenadoria Geral de Extensão",
    diretoria: "Diretoria de Pesquisa, Pós-Graduação e Extensão",
  },
];

const DEPARTAMENTOS_POR_ID = new Map(DEPARTAMENTOS_ELEGIVEIS.map((departamento) => [departamento.id, departamento]));

export function buscarDepartamentosElegiveis(busca?: string): readonly DepartamentoElegivel[] {
  const termo = normalizar(busca ?? "");
  if (!termo) return DEPARTAMENTOS_ELEGIVEIS;

  return DEPARTAMENTOS_ELEGIVEIS.filter((departamento) =>
    normalizar(`${departamento.nome} ${departamento.sigla ?? ""} ${departamento.diretoria}`).includes(termo),
  );
}

export function departamentoElegivelExiste(id: string): boolean {
  return DEPARTAMENTOS_POR_ID.has(id);
}

export function temPermissoesProfessor(tipoCredencial: TipoCredencial, departamentoElegivelId?: string | null): boolean {
  return tipoCredencial === TipoCredencial.SIAPE_TECNICO &&
    departamentoElegivelId !== null &&
    departamentoElegivelId !== undefined &&
    DEPARTAMENTOS_POR_ID.has(departamentoElegivelId);
}

function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
}
