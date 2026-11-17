/**
 * Lista de amigos por cuenta.
 */
import { listarAmigos, guardarAmigos } from "../persistencia.js";
import { tokenDe } from "./auth.js";
import express from "express";

export function registrarRutasAmigos(app) {
    app.get("/api/amigos", async (req, res) => {
        const out = await listarAmigos(tokenDe(req));
        res.status(out.status).json(out.body);
    });

    app.put("/api/amigos", express.json({ limit: "50kb" }), async (req, res) => {
        const out = await guardarAmigos(tokenDe(req), (req.body && req.body.amigos) || []);
        res.status(out.status).json(out.body);
    });
}
