Passo 1: Atualização das Entidades e Enums (Domínio)

Antes de criar a lógica, estruture as entidades base e os Enums conforme os atributos apresentados no diagrama.

    Criar/Atualizar Enums:

        NivelAcesso: ALUNO, PROFESSOR, COORDENADOR.

        StatusReserva: EM_ANALISE, AGENDADO, CONCLUIDO, CANCELADO.

        Frequencia: ANUAL, SEMESTRAL, MENSAL.

        Departamento: Lista dos departamentos do sistema.

    Atualizar Classe Usuario e Subclasses:

        Garantir que Usuario possua: uuid, email, telefone e nivelAcesso.

        Implementar as subclasses/especializações:

            Aluno: atributo matricula e curso.

            Servidor: departamento e siape.

            Tecnico (subclasse de Servidor).

            Professor (subclasse de Servidor).

        Adicionar a entidade Coordenacao (vinculando coordenador: Servidor e departamento: Departamento).

    Atualizar Entidade Reserva:

        Atributos de data/hora: dataHoraInicio e dataHoraFim (validar para que a duração seja exatamente de 50 minutos).

        Relacionamentos: sala, finalidade, statusReserva, solicitante (Usuario), responsavel (Usuario) e observacoes.

    Criar Entidades de Suporte:

        ReservaCoordenador: estende ou compõe Reserva incluindo solicitante: Coordenacao e frequencia: Frequencia.

        Cancelamento: reserva, cancelador (Usuario) e justificativa.

Passo 2: Implementação das Regras de Negócio e Agendamento

Crie uma camada de serviço (ex: ReservaService) para centralizar as validações no momento da criação da reserva.

    Validação de Duração de Turno:

        Garantir no código que dataHoraFim - dataHoraInicio == 50 minutos.

    Definição Automática do Status Inicial:

        Se o solicitante for um docente (Professor), definir statusReserva = AGENDADO automaticamente.

        Se for solicitado por Aluno ou Técnico, definir o status inicial conforme a necessidade de aprovação (EM_ANALISE ou AGENDADO dependendo da atribuição do responsável).

    Regra de Definição do Responsável:

        Quando um Aluno solicitar a reserva, obrigatoriamente deve-se indicar um responsável (Servidor ou Coordenação).

        O responsável indicado precisa aceitar e repassar ao coordenador do departamento para confirmação (caso esteja EM_ANALISE).

    Permissão de Solicitação para Outros:

        Somente a Coordenação pode definir um solicitante diferente do responsável ao agendar para outra pessoa.

        Para os demais papéis (exceto Aluno), o solicitante deve ser igual ao responsável.

    Diferença de Responsabilidade (Técnico vs. Aluno):

        Técnico: Pode ser responsável por uma reserva feita por um aluno e por si mesmo.

        Aluno: Nunca pode ser definido como responsável de nenhuma reserva.

    Limite de Reservas Diárias (Aluno e Técnico):

        Validar se o Aluno ou Técnico já possui 2 reservas no mesmo dia (independente do dia em que o agendamento foi marcado). Se atingido, bloquear a criação.

    Antecedência Mínima de Agendamento:

        Reservas feitas por Aluno ou Técnico devem ser criadas com no mínimo 12 horas de antecedência em relação ao dataHoraInicio.

Passo 3: Implementação das Interfaces do Diagrama

Implemente os contratos definidos para garantir o desacoplamento das operações.

    Interface IReservavel:

        Assinatura: reservar(reserva: Reserva): void

        Implemente nas classes de serviço responsáveis por processar a reserva conforme o perfil do usuário.

    Interface ICancelavel:

        Assinatura: cancelarReserva(reserva: Reserva): void

        Implemente no serviço de cancelamento de reservas.

Passo 4: Implementação do Fluxo e Regras de Cancelamento

Crie o módulo/serviço de cancelamento (CancelamentoService) respeitando as permissões por NivelAcesso:

    Permissões de Cancelamento por Perfil:

        Aluno: Pode cancelar apenas a própria reserva.

        Professor: Pode cancelar a própria reserva e solicitar o cancelamento de reservas de alunos para a coordenação.

        Coordenador: Pode cancelar qualquer reserva.

    Fluxo de Solicitação de Cancelamento por Professor:

        Quando um professor solicita o cancelamento de uma reserva de aluno:

            Verificar a qual departamento o responsável da reserva pertence.

            Enviar uma notificação ao coordenador do departamento para que ele decida se aprova ou rejeita o cancelamento.

    Registro do Cancelamento:

        Ao efetivar o cancelamento, registrar a entidade Cancelamento com o usuário cancelador e a justificativa, atualizando o statusReserva para CANCELADO.

Passo 5: Testes Unitários e de Integração Recomendados

Para garantir que todas as restrições descritas no diagrama funcionem corretamente, crie testes automatizados cobrindo os seguintes cenários:

    [x] Tentar criar reserva com duração diferente de 50 minutos (deve falhar).

    [x] Tentar criar reserva para Aluno/Técnico com menos de 12 horas de antecedência (deve falhar).

    [x] Tentar criar a 3ª reserva no mesmo dia para o mesmo Aluno ou Técnico (deve falhar).

    [x] Tentar definir um Aluno como responsável por uma reserva (deve falhar).

    [x] Confirmar se o status de reserva criada por Professor inicia como AGENDADO.

    [x] Garantir que Aluno não consiga cancelar reserva de outro usuário.

    [x] Verificar se a solicitação de cancelamento feita por Professor gera notificação para o Coordenador.