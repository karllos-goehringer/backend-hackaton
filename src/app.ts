import express from "express";
import { criarModuloAutenticacao } from "./features/autenticacao/autenticacao.module.js";
import { criarModuloCancelamentos } from "./features/cancelamentos/cancelamento.module.js";
import { criarModuloPredios } from "./features/predios/predios.module.js";
import { criarModuloReservas } from "./features/reservas/reservas.module.js";
import { criarModuloSalas } from "./features/salas/salas.module.js";
import { criarModuloUsuarios } from "./features/usuarios/usuarios.module.js";
import { errorHandler } from "./shared/http/error-handler.js";

const app = express();

app.use(express.json());

app.get("/health", (_request, response) => {
	response.status(200).json({ status: "ok" });
});

app.use("/usuarios", criarModuloUsuarios());
app.use("/autenticacao", criarModuloAutenticacao());
app.use("/predios", criarModuloPredios());
app.use("/salas", criarModuloSalas());
app.use("/reservas", criarModuloReservas());
app.use("/cancelamentos", criarModuloCancelamentos());

app.use(errorHandler);

export default app;
