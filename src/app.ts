import express from "express";

const app = express();

app.use(express.json());

app.get("/health", (_request, response) => {
	response.status(200).json({ status: "ok" });
});

export default app;
