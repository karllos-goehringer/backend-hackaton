import express from "express";
import { criarModuloCancelamentos } from "./features/cancelamentos/cancelamento.module.js";
import { criarModuloReservas } from "./features/reservas/reservas.module.js";
import { errorHandler } from "./shared/http/error-handler.js";

const app = express();

app.use(express.json());

app.get("/health", (_request, response) => {
	response.status(200).json({ status: "ok" });
});

app.use("/reservas", criarModuloReservas());
app.use("/cancelamentos", criarModuloCancelamentos());

app.use(errorHandler);

export default app;
