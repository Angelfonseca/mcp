import dotenv from "dotenv";
// TypeScript permitirá la importación aunque el archivo fuente sea .ts; al generar a .js funcionará.
// eslint-disable-next-line import/extensions
// @ts-ignore
import { USER_AGENT } from "../index.js";
// Configurar dotenv sin logs
dotenv.config({ debug: false });
/**
 * Error que encapsula la respuesta HTTP no exitosa.
 */
class FetchError extends Error {
    status;
    statusText;
    constructor(message, status, statusText) {
        super(message);
        this.name = "FetchError";
        this.status = status;
        this.statusText = statusText;
    }
}
/**
 * Envuelve fetch con timeout y manejo de errores.
 * Devuelve automáticamente JSON si `expectJson` es true.
 */
async function safeFetch(url, options = {}) {
    const { timeoutMs = 10_000, expectJson = true, headers: customHeaders = {}, ...fetchOptions } = options;
    // Unimos cabeceras por defecto con las pasadas por el caller
    const headers = {
        "User-Agent": USER_AGENT,
        accept: "application/json",
        ...customHeaders,
    };
    // AbortController para timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...fetchOptions, headers, signal: controller.signal });
        if (!response.ok) {
            throw new FetchError(`Request failed with status ${response.status}`, response.status, response.statusText);
        }
        // Determinar tipo de contenido para evitar parseos incorrectos
        const contentType = response.headers.get("content-type") ?? "";
        if (expectJson && contentType.includes("application/json")) {
            // Respuesta JSON válida
            return (await response.json());
        }
        // Fallback: devolver texto plano
        return (await response.text());
    }
    catch (error) {
        // Distinguimos entre abort y otros errores
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("La petición fue abortada por timeout");
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }
}
const SERPER_API_KEY = process.env.SERPER_API_KEY;
// Permitir override por variable de entorno
const SERPER_API_URL = process.env.SERPER_API_URL ?? "https://google.serper.dev/search";
async function searchWithSerper(query) {
    if (!SERPER_API_KEY) {
        throw new Error("La variable de entorno SERPER_API_KEY no está definida");
    }
    if (!query?.trim()) {
        throw new Error("El parámetro 'query' no puede estar vacío");
    }
    return safeFetch(SERPER_API_URL, {
        method: "POST",
        body: JSON.stringify({ q: query }),
        headers: {
            "Content-Type": "application/json",
            "X-API-KEY": SERPER_API_KEY,
        },
    });
}
export { safeFetch, searchWithSerper };
export default {
    safeFetch,
    searchWithSerper,
};
