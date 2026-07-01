import compression from "compression";
import express from "express";
import PinoHttp from "pino-http";
import sharp from "sharp";

import "dotenv/config";

import { apiFetch } from "./utils.ts";

const app = express();

const port = process.env.PORT || 3000;

app.use(compression());
app.use(PinoHttp());

// what image size to fetch from the klipy api
const fetchSize = process.env.FETCHSIZE || "xs";

const text = sharp("res/text.png");

app.get("/gifs/:gif.:ext", async (req, res) => {
    // redirect to donos if not discord
    if (!req.header("User-Agent")?.toLowerCase().includes("discord")) return res.redirect(302, "/");

    const { gif: gifID, ext } = req.params;

    if (!gifID || !ext) return res.redirect(302, "/");

    const gifAPIFetch = await apiFetch(`${process.env.GIF_BASE_URL}${gifID}`);

    if (!gifAPIFetch.ok) {
        req.log.warn(
            `API error: ${gifAPIFetch.status} on ${gifID} (${gifAPIFetch.statusText})`,
        );
        return res.status(500).send("Server error");
    }

    const gifJSON = await gifAPIFetch.json();

    if (!gifJSON.result) {
        req.log.warn(`Error: missing result on ${gifID}`);
    }

    const jpegURL = await gifJSON.data.file[fetchSize].jpg.url;

    const jpegFetch = await apiFetch(jpegURL);
    if (!gifAPIFetch.ok) {
        req.log.warn(
            `Fetch error: ${jpegFetch.status} at ${jpegFetch} [${gifID}] (${jpegFetch.statusText})`,
        );
        return res.status(500).send("Server error");
    }

    const jpegBuffer = await jpegFetch.arrayBuffer();

    if (!jpegBuffer.byteLength) {
        req.log.warn(`Fetch error: empty image at ${jpegFetch} (${gifID})`);
        return res.status(500).send("Server error");
    }

    const ogImg = sharp(jpegBuffer);

    const { width: w, height: h } = await ogImg.metadata();

    const hw = Math.round(w / 2);

    const l = await ogImg
        .clone()
        .extract({
            left: 0,
            top: 0,
            width: hw,
            height: h,
        })
        .toBuffer();
    const r = await ogImg
        .clone()
        .extract({
            left: hw,
            top: 0,
            width: w - hw,
            height: h,
        })
        .toBuffer();

    const blank = sharp({
        create: {
            width: w,
            height: h,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    });

    const f1 = await blank
        .clone()
        .composite([
            { input: l, top: Math.round(h * -0.1), left: 0 },
            { input: r, top: Math.round(h * 0.1), left: hw },
        ])
        .gif()
        .toBuffer();

    const f3 = await blank
        .clone()
        .composite([
            { input: l, top: Math.round(h * 0.1), left: 0 },
            { input: r, top: Math.round(h * -0.1), left: hw },
        ])
        .gif()
        .toBuffer();

    const ani = await sharp([f1, jpegBuffer, f3, jpegBuffer], {
        join: { animated: true },
    })
        .gif({ delay: Array(4).fill(300), loop: 0 })
        .toBuffer();

    const resized = sharp(ani, { animated: true }).resize(330);

    const { pageHeight, height: newHeight } = await sharp(
        await resized.clone().toBuffer(),
    ).metadata();

    const newH = pageHeight || newHeight;

    const resizedText = await text
        .clone()
        .extend({
            top: 8,
            bottom: newH - 42,
            left: 60,
            right: 61,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toBuffer();

    const finalImg = await resized
        .composite([{ input: resizedText, tile: true, top: 0, left: 0 }])
        .webp({ delay: Array(4).fill(300), loop: 0 })
        .toBuffer();

    res.setHeader("Content-Type", "image/webp");
    res.send(finalImg);
});

app.get("/gifs/:gif/", (req, res) => {
    if (!req.header("User-Agent")?.toLowerCase().includes("discord")) return res.redirect(302, "/");

    const gifID = req.params.gif;

    // discord does not correctly animate webp/gif images if they don't have their extension in the path. this is a workaround.
    res.status(200).send(`<html>
        <head><meta property="twitter:image" content="https://klx-sevenpy.com/gifs/${gifID}.webp?animated=true" /><meta property="twitter:card" content="summary_large_image" /></head>
        </html>`);
});

// on second run, redirect to the help page, passing the gif in the query
app.get("/gx-sevenfs/:gif/", (req, res) => {
    if (!req.header("User-Agent")?.toLowerCase().includes("discord")) return res.redirect(302, "/");

    const gifID = req.params.gif;

    res.redirect(`https://limes.pink/s/i/x-seven?gif=${gifID}`)
});

app.get("/{*catchall}", (_req, res) => {
    res.redirect("https://limes.pink/s/i/x-seven");
});

app.listen(port, () => {
    console.log(`klx-sevenpy listening at http://localhost:${port}`);
});
