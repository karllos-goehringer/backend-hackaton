export interface SalaInicialSeed {
  readonly nome: string;
  readonly capacidade: number | null;
}

export interface PredioInicialSeed {
  readonly nome: string;
  readonly salas: readonly SalaInicialSeed[];
}

/**
 * Conjunto oficial e autoritativo de predios e salas (IFES).
 * Nomes mantidos integralmente em portugues conforme especificados (incluindo grafia original
 * como "Complexo de Laboratório", "Agroindustria" e "Suino").
 * Capacidades nao especificadas sao representadas explicitamente por `null`.
 */
export const DADOS_INICIAIS_PREDIOS_SALAS: readonly PredioInicialSeed[] = [
  {
    nome: "Prédio Administrativo",
    salas: [
      { nome: "Auditório II", capacidade: 200 },
      { nome: "Sala de Reunião B", capacidade: 20 },
    ],
  },
  {
    nome: "Prédio Centro Tecnológico CT",
    salas: [
      { nome: "Sala 01 CT", capacidade: 40 },
      { nome: "Sala 02 CT", capacidade: 40 },
      { nome: "Sala 03 CT", capacidade: 30 },
      { nome: "Sala 04 CT", capacidade: 30 },
      { nome: "Sala 05 CT", capacidade: 30 },
      { nome: "Sala 06 CT", capacidade: 40 },
      { nome: "Sala 07 CT", capacidade: 20 },
      { nome: "Sala 08 CT", capacidade: 30 },
      { nome: "Sala 09 CT", capacidade: 20 },
    ],
  },
  {
    nome: "Prédio de Biologia",
    salas: [
      { nome: "Sala 01", capacidade: 40 },
      { nome: "Sala 02", capacidade: 40 },
      { nome: "Sala 03", capacidade: 40 },
      { nome: "Sala 04", capacidade: 40 },
    ],
  },
  {
    nome: "Prédio Pedagógico PP",
    salas: [
      { nome: "Auditório I PP", capacidade: 66 },
      { nome: "Sala 01 PP", capacidade: 32 },
      { nome: "Sala 02 PP", capacidade: 34 },
      { nome: "Sala 03 PP", capacidade: 32 },
      { nome: "Sala 04 PP", capacidade: 34 },
      { nome: "Sala 05 PP", capacidade: 31 },
      { nome: "Sala 06 PP", capacidade: 34 },
      { nome: "Sala 07 PP", capacidade: 28 },
      { nome: "Sala 08 PP", capacidade: 44 },
      { nome: "Sala 09 PP", capacidade: 34 },
      { nome: "Sala 10 PP", capacidade: 33 },
      { nome: "Sala 11 PP", capacidade: null },
      { nome: "Sala 12 PP", capacidade: null },
    ],
  },
  {
    nome: "Prédio TI",
    salas: [
      { nome: "Lab. Informática 1", capacidade: 20 },
      { nome: "Lab. Informática 2", capacidade: 20 },
      { nome: "Lab. Informática 3", capacidade: 20 },
      { nome: "Lab. Informática 4", capacidade: 20 },
      { nome: "Lab. Informática 5", capacidade: 20 },
      { nome: "Lab. de Ensino", capacidade: 19 },
      { nome: "Lab. de Robótica", capacidade: 9 },
      { nome: "Lab. de Física", capacidade: 16 },
    ],
  },
  {
    nome: "Salas Ambiente",
    salas: [
      { nome: "AGII", capacidade: 20 },
      { nome: "Agroindustria", capacidade: 20 },
      { nome: "Apicultura", capacidade: 20 },
      { nome: "Avicultura", capacidade: 20 },
      { nome: "Bovino", capacidade: 20 },
      { nome: "Mecanização", capacidade: 40 },
      { nome: "Sala de Desenho", capacidade: 20 },
      { nome: "Suino", capacidade: 20 },
    ],
  },
  {
    nome: "Complexo de Laboratório",
    salas: [
      { nome: "Diagnose de Doenças de Plantas", capacidade: 20 },
      { nome: "Lab. Anatomia", capacidade: 20 },
      { nome: "Lab. da Ciência do Café", capacidade: null },
      { nome: "Lab. de Águas e Resíduos", capacidade: 20 },
      { nome: "Lab. de Biologia", capacidade: 20 },
      { nome: "Lab. de Física", capacidade: 20 },
      { nome: "Lab. de Microbiologia", capacidade: 20 },
      { nome: "Lab. de Química", capacidade: 20 },
      { nome: "Lab. de Sementes", capacidade: 12 },
      { nome: "Lab. Ecologia e Biodiversidade", capacidade: 20 },
      { nome: "Lab. Entomologia Agrícola", capacidade: 20 },
      { nome: "Lab. Multidisciplinar", capacidade: 20 },
      { nome: "Lab. Solos e Meio Ambiente", capacidade: 20 },
      { nome: "Lab. Práticas de Ensino", capacidade: 20 },
      { nome: "Lab. Propagação de Planta", capacidade: 20 },
    ],
  },
];

